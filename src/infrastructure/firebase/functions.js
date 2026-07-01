import { firebase } from '@/api/repoClient';

export const invokeFunction = (name, payload) => firebase.functions.invoke(name, payload);
export const functions = firebase.functions;
