import { createLogger, log as internalLog } from '@ccusage/internal/logger';

export const logger = createLogger('@ccusage/devin');

export const log = internalLog;
