#include <mach-o/dyld.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(void) {
  char executable[PATH_MAX], resolved[PATH_MAX], root[PATH_MAX], node[PATH_MAX], script[PATH_MAX];
  uint32_t size = sizeof(executable);
  if (_NSGetExecutablePath(executable, &size) || !realpath(executable, resolved)) return 1;
  char *last = strrchr(resolved, '/');
  if (!last) return 1;
  *last = '\0';
  if (snprintf(root, sizeof(root), "%s/../Resources", resolved) >= sizeof(root)) return 1;
  if (snprintf(node, sizeof(node), "%s/runtime/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/node/bin/node", root) >= sizeof(node)) return 1;
  if (snprintf(script, sizeof(script), "%s/bootstrap.mjs", root) >= sizeof(script)) return 1;
  char *args[] = {node, script, NULL};
  execv(node, args);
  perror("DSH-X launcher");
  return 1;
}
