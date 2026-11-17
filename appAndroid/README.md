# trIAje móvil · una APK, dos accesos

La aplicación Android reúne en una sola APK la consulta básica del paciente y el acceso del médico.

## Preparar la demostración

1. En el computador, inicia el servicio MongoDB.
2. Abre PowerShell en `C:\triaje` y ejecuta `npm start`.
3. Conecta el celular y el computador a la misma red Wi‑Fi.
4. Averigua la IPv4 del computador con `ipconfig`.
5. Instala `Triaje.apk`. En la app toca el icono de conexión y escribe la IP del computador. Para un emulador Android en la misma PC, usa `10.0.2.2`.
6. Si Windows Defender pregunta por Node.js, permite conexiones en redes privadas para que el celular alcance el puerto 3000.

## Accesos de la app

En la pantalla de inicio puedes elegir:

- **Consulta de paciente:** ingresa el documento para ver el nombre, el documento parcialmente oculto, el nivel, el estado y el turno aproximado. La consulta pública no devuelve el motivo, observaciones, signos vitales ni otros datos clínicos.
- **Acceso del médico:** inicia con la cuenta médica registrada en la aplicación web. Para la cuenta de demostración: `medico` / `medico123`. El médico puede buscar y filtrar la cola, abrir detalles y marcar pacientes pendientes como atendidos. El servidor registra quién hizo el cambio y cuándo.

La lista clínica completa y la acción de marcar atendido están restringidas en el servidor al rol `doctor`. Cierra sesión al terminar.

## Alcance

El servidor Node.js y MongoDB deben permanecer funcionando en el computador mientras se usa el celular. La APK se comunica con el servidor por HTTP en la red local; MongoDB no se expone directamente al teléfono. Utiliza exclusivamente datos ficticios en esta demostración académica.
