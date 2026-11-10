"""Regression checks for the shell defects visible in the supplied screenshot."""
from pathlib import Path
import re
import uuid

ROOT = Path(__file__).resolve().parents[1]


def test_page_starts_with_doctype_and_has_german_document_language(client):
    html = client.get('/').get_data(as_text=True)
    assert html.lstrip().lower().startswith('<!doctype html>')
    assert '\ufeff' not in html[:html.index('<html')]
    assert '<html lang="de">' in html


def test_every_rendered_icon_exists_in_the_official_sprite(client):
    html = client.get('/').get_data(as_text=True)
    defined = set(re.findall(r'<symbol\s+id="([^"]+)"', html))
    used = set(re.findall(r'<use\s+href="#([^"]+)"', html))
    assert used
    assert used <= defined, f'Undefined icons: {used - defined}'
    assert 'pt-icon-work-order' in used
    assert 'pt-icon-user' in used
    assert 'pt-icon-parameters' in used
    assert 'pt-icon-add' in used


def test_template_loader_strips_bom_before_template_inheritance(app):
    name = '_bom_probe_' + uuid.uuid4().hex + '.html'
    path = ROOT / 'templates' / name
    path.write_bytes(b'\xef\xbb\xbf{% extends "layout.html" %}{% block content %}BOM probe{% endblock %}')
    try:
        with app.test_request_context('/'):
            app.preprocess_request()
            html = app.jinja_env.get_template(name).render()
        assert html.lstrip().lower().startswith('<!doctype html>')
    finally:
        path.unlink()


def test_html_is_not_cached_and_local_templates_reload(client, app):
    assert client.get('/').headers['Cache-Control'] == 'no-store'
    assert app.jinja_env.auto_reload is True


def test_hour_editor_dependencies_are_loaded_in_order(client):
    html = client.get('/').get_data(as_text=True)
    assert html.index('app/hours.js') < html.index('app/plan.js') < html.index('app/fine-editor.js')
    assert html.index('app/capacity.js') < html.index('app/capacity-view.js') < html.index('app/plan.js')
    for asset in ('hours.js', 'capacity.js', 'capacity-view.js', 'plan.js', 'fine-editor.js'):
        assert client.get('/static/app/' + asset).status_code == 200


def test_shell_dimensions_are_consumed_from_unmodified_kit_tokens():
    tokens = (ROOT / 'static/polytec/ops_platform_ui/css/connected-operations-tokens.css').read_text()
    shell = (ROOT / 'static/polytec/ops_platform_ui/css/ops-platform.css').read_text()
    assert '--polytec-ops-header-height: 56px' in tokens
    assert '--polytec-ops-header-height-compact: 52px' in tokens
    assert '--polytec-ops-footer-height: 52px' in tokens
    assert 'var(--polytec-touch-target-min)' in shell
    app_css = (ROOT / 'static/app/app.css').read_text()
    assert '.ops-header' not in app_css
    assert '.ops-navigation-item' not in app_css
