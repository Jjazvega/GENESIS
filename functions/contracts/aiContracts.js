/**
 * @typedef {Object} FirebaseUser
 * @property {string} uid Identificador del usuario autenticado por Firebase.
 *
 * @typedef {Object} CompanyAuthorization
 * @property {string} companyId Empresa validada para la solicitud.
 * @property {FirebaseFirestore.DocumentReference} companyRef Referencia Firestore de la empresa.
 * @property {Record<string, unknown>} company Datos de la empresa.
 * @property {string} role Rol normalizado del usuario en la empresa.
 * @property {Record<string, unknown>|null} membership Membresía validada cuando no es owner.
 * @property {{documentIds: string[], storagePaths: string[]}} requested Documentos solicitados.
 * @property {Array<Record<string, unknown> & {id: string}>} documents Documentos validados por tenant.
 *
 * @typedef {Object} AiRequestBody
 * Contrato estricto del frontend hacia POST /api/ai. El frontend manda JSON, nunca datos de Firestore directos.
 * @property {string} companyId Empresa activa sobre la que se autoriza la petición.
 * @property {string} prompt Prompt final construido por la UI con pregunta y contexto permitido.
 * @property {string[]=} documentIds IDs de documentos solicitados; el backend revalida tenant y acceso.
 * @property {string[]=} storagePaths Rutas solicitadas; el backend revalida tenant y acceso.
 * @property {string=} correlationId ID trazable también enviado como header X-Correlation-Id.
 * @property {Record<string, unknown>=} response_json_schema Esquema opcional para respuestas estructuradas.
 * @property {string=} integration Etiqueta de integración para auditoría/costo.
 * @property {Record<string, unknown>=} release Metadata de versión enviada por el frontend.
 *
 * @typedef {Object} AiUsageAccounting
 * Los tokens se reportan desde el proveedor y se reconcilian contra la reserva diaria.
 * @property {number} tokens Total real debitado en aiUsage.tokensUsed.
 * @property {number} costUsd Costo real debitado en aiUsage.budgetUsedUsd.
 * @property {number} costo Alias legado de costUsd.
 * @property {number} estimatedCostUsd Costo reservado antes de llamar al proveedor.
 *
 * @typedef {Object} AiSuccessResponse
 * Respuesta HTTP 200 de POST /api/ai.
 * @property {'completed'} status Estado final de la petición.
 * @property {string} response Texto devuelto por el modelo.
 * @property {string} provider Proveedor LLM usado.
 * @property {string} model Modelo usado.
 * @property {string} correlationId ID de trazabilidad.
 * @property {string=} companyId Empresa autorizada.
 * @property {Record<string, unknown>} release Metadata del backend.
 * @property {number} tokens Total de tokens reales.
 * @property {number} costUsd Costo real en USD.
 * @property {number} costo Alias legado de costUsd.
 * @property {number} estimatedCostUsd Costo estimado reservado.
 *
 * @typedef {Object} AiErrorResponse
 * Respuesta de error de POST /api/ai.
 * @property {string} error Mensaje seguro para UI.
 * @property {string} correlationId ID de trazabilidad.
 * @property {string=} companyId Empresa si llegó a autorizarse.
 * @property {Record<string, unknown>} release Metadata del backend.
 * @property {'CORS_FORBIDDEN'|'AUTH_REQUIRED'|'AUTH_INVALID'|'AI_PERMISSION_DENIED'|'AI_QUOTA_EXCEEDED'|'AI_BAD_REQUEST'|'AI_INTERNAL_ERROR'} code Código estable para distinguir 403 CORS de 403 por permiso.
 * @property {'cors'|'auth'|'permission'|'quota'|'validation'|'server'} type Tipo estable del error.
 *
 * @typedef {Object} AiDailyBudgetControl
 * aiUsage se controla por documento diario y empresa antes y después del proveedor.
 * @property {number} reservedTokens Tokens estimados reservados antes de llamar al LLM.
 * @property {number} tokensUsed Tokens reales acumulados tras reconcileAiReservation.
 * @property {number} budgetUsedUsd Costo real acumulado del día.
 * @property {number} completedRequestCount Solicitudes completadas del día.
 * @property {number} failedRequestCount Solicitudes fallidas del día.
 * @property {number} dailyTokenLimit Límite diario configurado por backend.
 * @property {number} dailyBudgetUsd Presupuesto diario configurado por backend.
 *
 * @typedef {Object} AiLimitReservation
 * @property {string} usageDocId Documento diario de uso reservado.
 * @property {string} rateDocId Documento de rate limit por usuario.
 * @property {number} estimatedTokens Tokens estimados reservados.
 * @property {number} estimatedCostUsd Costo estimado reservado en USD.
 * @property {number} reservedAtMs Timestamp de reserva.
 * @property {'reserved'} reservationStatus Estado de reserva.
 *
 * @typedef {Object} AiProviderResult
 * @property {string} outputText Texto final del proveedor LLM.
 * @property {number} latencyMs Latencia del proveedor en milisegundos.
 * @property {string} provider Proveedor LLM usado.
 * @property {string} model Modelo LLM usado.
 * @property {Record<string, number>} usage Contadores de tokens devueltos por proveedor.
 */

module.exports = {};
