import { EventEmitter } from 'events';

export interface DashboardEvent {
  type:
    | 'message'
    | 'bot_message'
    | 'task_start'
    | 'task_complete'
    | 'task_error'
    | 'channel_status';
  data: Record<string, unknown>;
  timestamp: string;
}

export const dashboardEvents = new EventEmitter();
