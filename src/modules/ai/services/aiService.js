import { firebase } from '@/api/repoClient';
import { invokeLLM } from '@/api/aiClient';

export async function askLLM(params) {
  return invokeLLM(params);
}

export const aiService = {
  askLLM,
  invokeLLM: askLLM,
  agents: firebase.agents,
};

export default aiService;
