import { z } from 'zod';
import { COMPANY_ROLES } from '@/shared/constants/roles';

export const memberSchema = z.object({
  companyId: z.string().trim().min(1, 'La empresa es obligatoria.'),
  userEmail: z.string().trim().email('Correo inválido.'),
  role: z.enum(COMPANY_ROLES).default('invitado'),
});
