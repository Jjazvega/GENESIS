# Arquitectura por capas obligatoria

Esta guía define el significado único de cada carpeta de `src/` para eliminar ambigüedad entre `pages/`, `modules/`, `features/`, `api/`, `infrastructure/` y `lib/`. Toda contribución nueva debe respetar estas reglas antes de aprobarse.

## Responsabilidad de cada capa

| Capa | Responsabilidad | Puede contener | No debe contener |
| --- | --- | --- | --- |
| `pages/` | Composición de pantallas y rutas de alto nivel. | Layout de una pantalla, wiring de módulos/features, carga de datos de presentación, estados visuales. | Reglas de negocio reutilizables, integración directa con Firebase, clientes HTTP propios. |
| `modules/` | Boundary público de cada dominio. Es la puerta de entrada estable para que otras capas consuman un dominio. | `index.js`, páginas del dominio, componentes públicos, servicios públicos del módulo, adaptadores hacia features del mismo dominio. | Detalles internos importados por otros dominios, acceso directo a Firebase, duplicación de lógica de `features/`. |
| `features/` | Lógica de negocio por caso de uso. | Flujos, validaciones, hooks o componentes centrados en un caso de uso concreto, constantes del dominio. | Composición de pantallas completas, SDKs técnicos directos, lógica transversal reutilizable por dominios no relacionados. |
| `api/` | Fachada de acceso a servicios para el frontend. | Clientes y funciones que exponen operaciones de backend con una API estable para UI, modules y features. | Inicialización técnica de SDKs, reglas de negocio de casos de uso, componentes React. |
| `infrastructure/` | Integración técnica con Firebase y otros proveedores técnicos. | Inicialización de SDKs, repositorios, storage, auth, functions, normalizadores y middleware técnico. | Decisiones de producto, composición de UI, reglas de negocio específicas de una feature. |
| `lib/` | Utilidades transversales sin negocio. | Helpers genéricos, providers transversales, observabilidad, utilidades de UI o runtime compartidas. | Casos de uso de negocio, servicios de dominio, acceso técnico que debería estar en `api/` o `infrastructure/`. |

## Reglas de importación

### Reglas globales

1. Ninguna capa fuera de `src/infrastructure/` debe importar SDKs de Firebase directamente. Se debe usar `src/api/` o los wrappers públicos de infraestructura existentes.
2. `lib/` solo puede alojar utilidades transversales; si una función conoce conceptos de negocio de un dominio, debe moverse a `features/<dominio>/` o exponerse desde `modules/<dominio>/`.
3. Los imports entre dominios deben cruzar por el boundary público de `modules/<dominio>/`, no por archivos internos profundos del otro dominio.
4. Las rutas relativas profundas entre capas deben evitarse cuando exista alias `@/`; los imports deben dejar clara la capa consumida.
5. Una capa puede depender de capas más técnicas o transversales, pero no debe saltarse fachadas públicas para acceder a detalles internos.

### Matriz permitida

| Desde | Puede importar | Restricciones |
| --- | --- | --- |
| `pages/` | `modules/`, `features/`, `api/`, `lib/`, componentes compartidos. | Solo compone pantalla; no implementa flujos de negocio ni integra Firebase. |
| `modules/<dominio>/` | `features/<mismo-dominio>/`, `api/`, `lib/`, componentes compartidos. | Otros dominios deben consumir su API pública, preferentemente `modules/<dominio>/index.js`. |
| `features/<dominio>/` | `api/`, `lib/`, `features/<mismo-dominio>/`. | No debe importar `pages/`; si necesita otro dominio, usar `modules/<otro-dominio>/` como boundary público. |
| `api/` | `infrastructure/`, `lib/` y contratos/constantes compartidas estrictamente necesarias. | No debe importar `pages/` ni componentes React. La lógica de negocio compleja vive en `features/`. |
| `infrastructure/` | SDKs técnicos, configuración, helpers técnicos de `lib/`. | No debe importar `pages/`, `modules/` ni `features/`. |
| `lib/` | Otras utilidades de `lib/` y dependencias transversales. | No debe importar `pages/`, `modules/` ni `features/` salvo providers existentes durante migraciones justificadas. |

## Criterios de revisión obligatorios

Antes de abrir o aprobar un cambio:

1. Identificar la capa tocada y confirmar que el archivo cumple la responsabilidad de la tabla.
2. Verificar que cualquier acceso a Firebase pasa por `api/` o `infrastructure/`.
3. Confirmar que una feature nueva tiene nombre de caso de uso y no queda escondida en `pages/` o `lib/`.
4. Confirmar que un módulo expone solo su boundary público y no obliga a otros dominios a importar archivos internos.
5. Ejecutar `npm run validate:architecture -- --local-only` para cubrir las reglas automatizadas disponibles.

## Cómo decidir dónde ubicar código nuevo

- ¿Es una pantalla completa o ruta? Usar `pages/`.
- ¿Es la API pública de un dominio para el resto de la app? Usar `modules/<dominio>/`.
- ¿Es un caso de uso con reglas de negocio? Usar `features/<dominio>/`.
- ¿Es una llamada estable que abstrae servicios/backend? Usar `api/`.
- ¿Es integración técnica con Firebase? Usar `infrastructure/firebase/`.
- ¿Es un helper transversal sin negocio? Usar `lib/`.
