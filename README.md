# App-screener

Este repositorio ahora incluye una base para empaquetar tu aplicación web como app de Android usando **Capacitor**.

## Requisitos

- Node.js 20+
- Java 17+
- Android Studio (SDK + emulator/dispositivo)

## Configuración inicial

1. Instala dependencias:
   ```bash
   npm install
   ```
2. Construye los archivos web (se generan en `dist/`):
   ```bash
   npm run build
   ```
3. Agrega Android por primera vez:
   ```bash
   npm run android:add
   ```
4. Sincroniza cambios web con Android:
   ```bash
   npm run android:sync
   ```
5. Abre el proyecto Android en Android Studio:
   ```bash
   npm run android:open
   ```

## Flujo recomendado para cada cambio web

```bash
npm run build
npm run android:sync
npm run android:open
```

Después, desde Android Studio puedes ejecutar en emulador o dispositivo físico.

## Estructura

- `capacitor.config.ts`: configuración de la app nativa.
- `public/`: archivos web de ejemplo.
- `dist/`: salida de build web usada por Capacitor.

> Si ya tienes otra app web (React/Vue/Angular), solo asegúrate de que su build termine en `dist/` o ajusta `webDir` en `capacitor.config.ts`.
