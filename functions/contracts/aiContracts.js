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
