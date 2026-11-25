/*
 * Configuración de despliegue.
 *
 * En web, la app llama a /api/... en el mismo origen (server/index.js).
 * Si empaquetas con Capacitor (Android), no hay servidor local: pon aquí la URL
 * pública de tu proxy y la app pedirá los datos allí. Ejemplo:
 *
 *   window.MOAT_API_BASE = 'https://datos.mi-dominio.com';
 *
 * La clave del proveedor vive en el servidor, nunca en este archivo.
 */
window.MOAT_API_BASE = '';
