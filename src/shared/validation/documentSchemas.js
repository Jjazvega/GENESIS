import { z } from 'zod';
import { DOCUMENT_TYPE_OPTIONS } from '@/shared/constants/documentTypes';

export const documentSchema = z.object({
  companyId: z.string().trim().min(1, 'La empresa es obligatoria.'),
  name: z.string().trim().min(1, 'El nombre del documento es obligatorio.'),
  docType: z.enum(DOCUMENT_TYPE_OPTIONS).default('otro'),
});
