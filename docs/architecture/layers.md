# Arquitectura por capas obligatoria

Esta guía define el significado único de cada carpeta de `src/` para eliminar ambigüedad entre `pages/`, `modules/`, `features/`, `api/`, `infrastructure/` y `lib/`. Toda contribución nueva debe respetar estas reglas antes de aprobarse.

## Responsabilidad de cada capa

| Capa | Responsabilidad | Puede contener | No debe contener |
| --- | --- | --- | --- |
| `pages/` | Composición de pantallas y rutas de alto nivel. | Layout de una pantalla, wiring de módulos/features, carga de datos de presentación, estados visuales. | Reglas de negocio reutilizables, integración directa con Firebase, clientes HTTP propios. |
| `modules/` | Boundary público de cada dominio. Es la puerta de entrada estable para que otras capas consuman un dominio. | `index.js`, páginas del dominio, componentes públicos, servicios públicos del módulo, adaptadores hacia features del mismo dominio. | Detalles internos importados por otros dominios, acceso directo a Firebase, duplicación de lógica de `features/`. |
| `features/` | Lógica de negocio por caso de uso. | Flujos, validaciones, hooks o componentes centrados en un caso de uso concreto, constantes del dominio. | Composición de pantallas completas, SDKs técnicos directos, lógica transversal reutilizable por dominios no relacionados. |
| `api/` | Fachada de acceso a servicios para el frontend, **dividida por dominio**. | Clientes específicos (`authClient.js`, `aiClient.js`, `repoClient.js`) que exponen operaciones de backend con una API estable para UI, modules y features. | Inicialización técnica de SDKs, reglas de negocio de casos de uso, componentes React. |
| `infrastructure/` | Integración técnica con Firebase y otros proveedores técnicos. | Inicialización de SDKs, repositorios, storage, auth, functions, normalizadores y middleware técnico. | Decisiones de producto, composición de UI, reglas de negocio específicas de una feature. |
| `lib/` | Utilidades transversales sin negocio. | Helpers genéricos, providers transversales, observabilidad, utilidades de UI o runtime compartidas. | Casos de uso de negocio, servicios de dominio, acceso técnico que debería estar en `api/` o `infrastructure/`. |

## Clientes de API por dominio (`src/api/`)

La capa `api/` está segmentada en clientes independientes. Importar del cliente incorrecto viola las fronteras de seguridad:

| Archivo | Responsabilidad | Acceso a Firebase |
| --- | --- | --- |
| `firebaseClient.js` | **Solo primitivas**: re-exporta `app`, `db`, `auth`, `storage` de `@/firebase`. Sin lógica de negocio. | Solo re-export |
| `authClient.js` | Operaciones de autenticación: `getAuthHeader`, `me`, `logout`, `syncUserProfile`. | `auth` + `db` (perfil de usuario) |
| `aiClient.js` | Llamadas HTTP a la API de IA y funciones internas. Valida inputs con **Zod**. Sin acceso a Firestore. | Solo `auth` (lectura de token) |
| `repoClient.js` | Repositorios de entidades, agentes de conversación, facade `firebase`. Ensambla `authClient` + `aiClient`. | `auth` + `db` (escrituras de negocio) |

### Regla de aislamiento de `aiClient.js`

`aiClient.js` **no puede importar `db`** (Firestore). Esta restricción es verificada automáticamente por `scripts/validate-architecture.js`. El cliente de IA solo tiene acceso de lectura a Firebase Auth (para obtener tokens de identidad) y realiza sus operaciones exclusivamente mediante llamadas HTTP al backend de Cloud Functions.

### Validación zero-trust con Zod

Los inputs de `invokeLLM` y `invokeFunction` en `aiClient.js` son validados con esquemas Zod antes de hacer cualquier llamada de red. Esto evita que datos malformados lleguen al backend.

## Reglas de importación

### Reglas globales

1. Ninguna capa fuera de `src/infrastructure/` debe importar SDKs de Firebase directamente. Se debe usar los clientes en `src/api/` o los wrappers públicos de infraestructura existentes.
2. `lib/` solo puede alojar utilidades transversales; si una función conoce conceptos de negocio de un dominio, debe moverse a `features/<dominio>/` o exponerse desde `modules/<dominio>/`.
3. Los imports entre dominios deben cruzar por el boundary público de `modules/<dominio>/`, no por archivos internos profundos del otro dominio.
4. Las rutas relativas profundas entre capas deben evitarse cuando exista alias `@/`; los imports deben dejar clara la capa consumida.
5. Una capa puede depender de capas más técnicas o transversales, pero no debe saltarse fachadas públicas para acceder a detalles internos.
6. Los componentes de UI deben importar el facade `firebase` desde `@/api/repoClient`, no desde `@/api/firebaseClient`.

### Matriz permitida

| Desde | Puede importar | Restricciones |
| --- | --- | --- |
| `pages/` | `modules/`, `features/`, `api/`, `lib/`, componentes compartidos. | Solo compone pantalla; no implementa flujos de negocio ni integra Firebase. |
| `modules/<dominio>/` | `features/<mismo-dominio>/`, `api/`, `lib/`, componentes compartidos. | Otros dominios deben consumir su API pública, preferentemente `modules/<dominio>/index.js`. |
| `features/<dominio>/` | `api/`, `lib/`, `features/<mismo-dominio>/`. | No debe importar `pages/`; si necesita otro dominio, usar `modules/<otro-dominio>/` como boundary público. |
| `api/` | `infrastructure/`, `lib/` y contratos/constantes compartidas estrictamente necesarias. | No debe importar `pages/` ni componentes React. La lógica de negocio compleja vive en `features/`. `aiClient.js` no puede importar `db`. |
| `infrastructure/` | SDKs técnicos, configuración, helpers técnicos de `lib/`. | No debe importar `pages/`, `modules/` ni `features/`. |
| `lib/` | Otras utilidades de `lib/` y dependencias transversales. | No debe importar `pages/`, `modules/` ni `features/` salvo providers existentes durante migraciones justificadas. |

## Criterios de revisión obligatorios

Antes de abrir o aprobar un cambio:

1. Identificar la capa tocada y confirmar que el archivo cumple la responsabilidad de la tabla.
2. Verificar que cualquier acceso a Firebase pasa por el cliente de API correcto (`authClient`, `aiClient` o `repoClient`).
3. Confirmar que una feature nueva tiene nombre de caso de uso y no queda escondida en `pages/` o `lib/`.
4. Confirmar que un módulo expone solo su boundary público y no obliga a otros dominios a importar archivos internos.
5. Ejecutar `npm run validate:architecture -- --local-only` para cubrir las reglas automatizadas disponibles.
6. Confirmar que ningún componente frontend importa `db` directamente ni accede a mutaciones del repositorio fuera de `repoClient.js`.

## Cómo decidir dónde ubicar código nuevo

- ¿Es una pantalla completa o ruta? Usar `pages/`.
- ¿Es la API pública de un dominio para el resto de la app? Usar `modules/<dominio>/`.
- ¿Es un caso de uso con reglas de negocio? Usar `features/<dominio>/`.
- ¿Es una llamada HTTP a backend o Firebase Auth? Usar `api/aiClient.js`.
- ¿Es una operación de autenticación o perfil de usuario? Usar `api/authClient.js`.
- ¿Es acceso a repositorios de entidades o agentes de IA? Usar `api/repoClient.js`.
- ¿Es integración técnica con Firebase? Usar `infrastructure/firebase/`.
- ¿Es un helper transversal sin negocio? Usar `lib/`.

## Seguridad en la frontera frontend/backend

- **No confiar en validaciones solo del lado cliente**: `aiClient.js` valida con Zod antes de enviar, pero el backend Cloud Functions es la frontera de seguridad real (Firebase Auth + Firestore Rules).
- **Enforcement de auditoría en backend**: las mutaciones críticas están en Cloud Functions (`functions/handlers/`), no son evitables modificando el cliente.
- **Aislamiento de credenciales de AI**: `aiClient.js` no tiene acceso a `db`, por lo que un bypass de la capa AI no puede mutar la base de datos directamente.
- **Tokens frescos por petición**: `getAuthHeader()` obtiene un token fresco (`getIdToken()`) en cada llamada HTTP para garantizar que no se reutilizan tokens expirados.

