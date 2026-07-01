# GEMAILLA Core

Versión limpia enfocada en el núcleo estratégico:

- Empresas
- Documentos
- Finanzas
- IA

## Comandos

```bash
npm install
npm run test:unit
npm run build
npm run dev
```

## Validación realizada

- npm run test:unit: OK, 52 pruebas pasan
- npm run build: OK
- npm run lint: OK
- npm run typecheck:core: OK
- npm run validate:architecture: OK

## Limpieza aplicada

- Rutas principales reducidas a Dashboard, Empresas, Documentos, Finanzas e IA.
- Menú desktop reducido al núcleo Core.
- Menú móvil reducido al núcleo Core.
- Eliminados módulos secundarios de navegación: CRM, ERP, RRHH, Operaciones, Predicción, Auditoría, Cliente, Soporte y Suscripciones como páginas principales.
- Eliminados los restos técnicos en `src/features/crm`, `src/features/erp` y `src/features/operations`; no se archivan en el código porque no tienen rutas, imports ni propósito activo dentro del Core.
- Eliminados backups de Dashboard dentro de src/pages.
- Eliminada variable heredada VITE_LLM_ENDPOINT de .env.example.

## Nota técnica

Se conservaron componentes internos de soporte cuando eran dependencias reales de los módulos Core, por ejemplo compuertas de plan o generación de reportes usados por Documentos/IA.
