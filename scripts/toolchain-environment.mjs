import { join } from 'node:path';

// No object spread from process.env: this is an allowlist, not a secret blacklist.
export function toolchainEnvironment(base, temporaryRoot) {
  return {
    PATH: base.PATH ?? '',
    ...(base.SystemRoot ? { SystemRoot: base.SystemRoot } : {}),
    HOME: join(temporaryRoot, 'home'),
    USERPROFILE: join(temporaryRoot, 'home'),
    XDG_CONFIG_HOME: join(temporaryRoot, 'home', '.config'),
    TMPDIR: join(temporaryRoot, 'tmp'),
    TMP: join(temporaryRoot, 'tmp'),
    TEMP: join(temporaryRoot, 'tmp'),
    NPM_CONFIG_USERCONFIG: join(temporaryRoot, 'npmrc'),
    NPM_CONFIG_GLOBALCONFIG: join(temporaryRoot, 'global-npmrc'),
    NPM_CONFIG_CACHE: join(temporaryRoot, 'npm-cache'),
    NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
    NPM_CONFIG_IGNORE_SCRIPTS: 'true',
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_FUND: 'false',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    NO_UPDATE_NOTIFIER: '1',
  };
}
