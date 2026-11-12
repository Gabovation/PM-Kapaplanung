"""Eigene MongoDB-Collections für Planung und App-Konten im Serverbetrieb."""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import os
import re
import secrets
from urllib.parse import parse_qsl, urlsplit

from pymongo import MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError


class RevisionConflict(Exception):
    pass


class ServerStore:
    def __init__(self, database, prefix: str):
        if not re.fullmatch(r'kapa_[a-z0-9_]{0,32}', prefix):
            raise ValueError('Das Collection-Präfix muss mit kapa_ beginnen und darf nur Kleinbuchstaben, Zahlen und Unterstriche enthalten.')
        self._database = database
        self._planning = database[prefix + 'planning']
        self._users = database[prefix + 'users']
        self._sessions = database[prefix + 'sessions']
        self._audit = database[prefix + 'audit']

    @classmethod
    def from_environment(cls):
        uri = os.environ.get('MONGODB_URI', '').strip()
        name = os.environ.get('MONGODB_DATABASE', '').strip()
        prefix = os.environ.get('KAPA_COLLECTION_PREFIX', '').strip()
        if not uri or not name or not prefix:
            raise ValueError('MONGODB_URI, MONGODB_DATABASE und KAPA_COLLECTION_PREFIX müssen gesetzt sein.')
        if not re.fullmatch(r'kapa_[a-z0-9_]{0,32}', prefix):
            raise ValueError('Ungültiges Collection-Präfix.')
        options = {key.lower(): value.lower() for key, value in parse_qsl(urlsplit(uri).query)}
        if any(options.get(key) in ('true', '1', 'yes') for key in ('tlsinsecure', 'tlsallowinvalidcertificates', 'tlsallowinvalidhostnames')):
            raise ValueError('Unsichere TLS-Optionen sind nicht zulässig.')
        ca_file = os.environ.get('MONGODB_CA_FILE', '').strip()
        extra = {'tlsCAFile': ca_file} if ca_file else {}
        # One reusable client; driver reconnects after a temporary outage.
        client = MongoClient(uri, serverSelectionTimeoutMS=3000, connectTimeoutMS=3000, socketTimeoutMS=5000, appname='kapa-planung', **extra)
        return cls(client[name], prefix)

    def ping(self):
        return bool(self._database.client.admin.command('ping').get('ok'))

    def close(self):
        self._database.client.close()

    def read_planning(self):
        record = self._planning.find_one({'_id': 'active'})
        if record is None:
            return None
        data = deepcopy(record['data'])
        data['_revision'] = record['revision']
        return data

    def save_planning(self, snapshot, actor=None):
        data = deepcopy(snapshot)
        revision = data.pop('_revision', 0)
        if isinstance(revision, bool) or not isinstance(revision, int) or revision < 0:
            raise ValueError('Ungültige Revision.')
        try:
            update = {'$set': {'data': data}, '$inc': {'revision': 1}}
            if actor:
                update['$push'] = {'history': {'$each': [{'actor': actor, 'event': 'planning.saved', 'at': datetime.now(timezone.utc)}], '$slice': -1000}}
            record = self._planning.find_one_and_update(
                {'_id': 'active', 'revision': revision},
                update,
                upsert=revision == 0, return_document=ReturnDocument.AFTER,
            )
        except DuplicateKeyError as exc:
            raise RevisionConflict from exc
        if record is None:
            raise RevisionConflict
        return record['revision']

    def find_user(self, username):
        return self._users.find_one({'_id': username})

    def create_user(self, username, password_hash, role, *, must_change_password=False):
        self._users.insert_one({'_id': username, 'password_hash': password_hash, 'role': role, 'active': True, 'session_version': 1, 'must_change_password': must_change_password})

    def list_users(self):
        return list(self._users.find({}, {'password_hash': 0}).sort('_id', 1))

    def set_password(self, username, password_hash, *, must_change_password=True):
        return self._users.update_one({'_id': username}, {'$set': {'password_hash': password_hash, 'must_change_password': must_change_password}, '$inc': {'session_version': 1}}).matched_count == 1

    def change_password(self, username, old_hash, new_hash):
        return self._users.update_one({'_id': username, 'password_hash': old_hash}, {'$set': {'password_hash': new_hash, 'must_change_password': False}, '$inc': {'session_version': 1}}).matched_count == 1

    def set_active(self, username, active):
        return self._users.update_one({'_id': username}, {'$set': {'active': active}, '$inc': {'session_version': 1}}).matched_count == 1

    def set_role(self, username, role):
        return self._users.update_one({'_id': username}, {'$set': {'role': role}, '$inc': {'session_version': 1}}).matched_count == 1

    def initialize_indexes(self):
        """Explicit setup action; not run by a read-only health check."""
        self._sessions.create_index('expires_at', expireAfterSeconds=0, name='session_expiry')

    def record_event(self, event, actor, target=''):
        self._audit.insert_one({'event': event, 'actor': actor, 'target': target, 'at': datetime.now(timezone.utc)})

    def create_session(self, username, version):
        token = secrets.token_urlsafe(32)
        digest = hashlib.sha256(token.encode('ascii')).hexdigest()
        expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=12)
        self._sessions.insert_one({'_id': digest, 'username': username, 'session_version': version, 'expires_at': expires})
        return token

    def find_session(self, token):
        if not isinstance(token, str) or len(token) > 128:
            return None
        digest = hashlib.sha256(token.encode('utf-8')).hexdigest()
        return self._sessions.find_one({'_id': digest, 'expires_at': {'$gt': datetime.now(timezone.utc).replace(tzinfo=None)}})

    def delete_session(self, token):
        if isinstance(token, str) and len(token) <= 128:
            self._sessions.delete_one({'_id': hashlib.sha256(token.encode('utf-8')).hexdigest()})
