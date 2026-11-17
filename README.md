# trIAje · prototipo académico

Aplicación de demostración en HTML, CSS, JavaScript, Node.js, Express y MongoDB Community Server local.

## Iniciar

1. Comprueba que el servicio MongoDB esté iniciado en Windows.
2. En PowerShell, ejecuta:

   ```powershell
   cd C:\triaje
   npm start
   ```

3. Abre `http://localhost:3000`. No abras `index.html` directamente como archivo.

La base local es `triaje_demo`. Al iniciar, el sistema prepara tres colecciones: `patients` (pacientes), `users` (cuentas de acceso) y `roles` (catálogo de permisos). Compass se conecta con `mongodb://127.0.0.1:27017`.

## Cuentas iniciales ficticias

- Administrador: `admin` / `admin123`
- Jefe de enfermería: `enfermeria` / `enfermeria123`
- Médico: `medico` / `medico123`
- Paciente: `DEMO-101` / `paciente123`

Las cuentas se guardan en MongoDB y sus contraseñas se almacenan como hashes. El administrador puede consultar el directorio de usuarios y roles, y registrar nuevas cuentas desde la interfaz.

## Datos de auditoría del paciente

Cada paciente guarda quién hizo el registro (`registeredBy`) y quién marcó su atención como completada (`attendedBy`). Si el médico cambia el estado a `Atendido`, su cuenta queda asociada como responsable de esa actualización. Las fechas de creación y modificación quedan en `createdAt` y `updatedAt`.

## Alcance y seguridad

El API está enlazado únicamente a `127.0.0.1` para la demostración local. Esto no es un despliegue clínico: no uses datos reales de pacientes ni expongas el prototipo a internet. Las cuentas iniciales son credenciales demostrativas y deben cambiarse antes de cualquier despliegue. El nivel de triaje lo asigna el personal de salud; el sistema no diagnostica ni decide prioridades.
