import { firebase } from '@/api/firebaseClient';

export const invokeFunction = (name, payload) => firebase.functions.invoke(name, payload);
export const functions = firebase.functions;
