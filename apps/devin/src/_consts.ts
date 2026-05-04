import { homedir } from 'node:os';
import path from 'node:path';

export const DEVIN_DATA_DIR_ENV = 'DEVIN_DATA_DIR';

const DEFAULT_DEVIN_PATH = '.local/share/devin';
const USER_HOME_DIR = homedir();

export const DEFAULT_DEVIN_DIR = path.join(USER_HOME_DIR, DEFAULT_DEVIN_PATH);
export const DEVIN_CLI_DIR_NAME = 'cli';
export const DEVIN_SESSIONS_DB_NAME = 'sessions.db';
