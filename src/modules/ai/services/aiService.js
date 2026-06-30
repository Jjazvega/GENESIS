import { firebase, invokeLLM } from '@/api/firebaseClient';

export async function askLLM(params) {
  return invokeLLM(params);
}

export const aiService = {
  askLLM,
  invokeLLM: askLLM,
  agents: firebase.agents,
};

export default aiService;
