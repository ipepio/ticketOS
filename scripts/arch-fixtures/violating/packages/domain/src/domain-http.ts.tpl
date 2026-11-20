import { request } from 'node:https';

export const fetchUpstream = () => request('https://example.com');
