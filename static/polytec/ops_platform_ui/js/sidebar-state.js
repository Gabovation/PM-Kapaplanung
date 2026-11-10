// Runs in the head, before the workspace can paint. Module initialization later sets accessible
// labels; the shell width must already match the stored preference when the body is rendered.
try {
  document.documentElement.dataset.opsSidebarCollapsed = sessionStorage.getItem('polytec-ui:sidebar-collapsed') !== 'false' ? 'true' : 'false';
} catch {
  document.documentElement.dataset.opsSidebarCollapsed = 'true';
}
