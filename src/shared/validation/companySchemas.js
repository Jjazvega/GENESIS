import { z } from 'zod';

export const companySchema = z.object({
  name: z.string().trim().min(1, 'El nombre de la empresa es obligatorio.'),
  rfc: z.string().trim().optional(),
  industry: z.string().trim().optional(),
  email: z.string().trim().email('Correo inválido.').optional().or(z.literal('')),
});
