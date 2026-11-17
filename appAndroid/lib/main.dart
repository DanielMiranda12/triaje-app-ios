import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() => runApp(const TriajeDoctorApp());

const _primary = Color(0xFF3449C7);
const _ink = Color(0xFF182334);
const _muted = Color(0xFF6D7889);
const _line = Color(0xFFE3E8EF);

class TriajeDoctorApp extends StatelessWidget {
  const TriajeDoctorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'trIAje · Médico',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: _primary),
        scaffoldBackgroundColor: const Color(0xFFF4F6FA),
        useMaterial3: true,
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFFF8FAFC),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: _line),
          ),
        ),
      ),
      home: const DoctorHomeScreen(),
    );
  }
}

class DoctorHomeScreen extends StatefulWidget {
  const DoctorHomeScreen({super.key});

  @override
  State<DoctorHomeScreen> createState() => _DoctorHomeScreenState();
}

enum _AppMode { home, patient, doctor }

class _DoctorHomeScreenState extends State<DoctorHomeScreen> {
  static const int _serverPort = 3000;

  final _formKey = GlobalKey<FormState>();
  final _username = TextEditingController(text: 'medico');
  final _password = TextEditingController();
  final _search = TextEditingController();
  final _serverIp = TextEditingController(text: '10.0.2.2');
  final _lookupDocument = TextEditingController();

  _AppMode _mode = _AppMode.home;
  String? _sessionCookie;
  Map<String, dynamic>? _currentUser;
  List<Map<String, dynamic>> _patients = [];
  Map<String, dynamic>? _publicPatient;
  String _selectedLevel = '';
  String? _errorMessage;
  String? _lookupError;
  String? _busyPatientId;
  bool _loggingIn = false;
  bool _loadingPatients = false;
  bool _lookingUpPatient = false;
  bool _obscurePassword = true;

  Uri _uri(String path) => Uri.parse(
        'http://${_serverIp.text.trim()}:$_serverPort$path',
      );

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_sessionCookie != null) 'Cookie': _sessionCookie!,
      };

  Map<String, dynamic> _decode(http.Response response) {
    if (response.body.isEmpty) return <String, dynamic>{};
    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) return decoded;
    return <String, dynamic>{'data': decoded};
  }

  String _responseMessage(http.Response response) {
    try {
      final body = _decode(response);
      return body['error']?.toString() ??
          'El servidor respondió con código ${response.statusCode}.';
    } catch (_) {
      return 'No se pudo interpretar la respuesta del servidor.';
    }
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _loggingIn = true;
      _errorMessage = null;
      _sessionCookie = null;
    });

    try {
      final response = await http
          .post(
            _uri('/api/auth/login'),
            headers: _headers,
            body: jsonEncode({
              'username': _username.text.trim(),
              'password': _password.text,
            }),
          )
          .timeout(const Duration(seconds: 10));

      if (response.statusCode != 200) {
        throw Exception(_responseMessage(response));
      }

      final cookie = response.headers['set-cookie'];
      if (cookie == null || !cookie.startsWith('triaje.sid=')) {
        throw Exception('El servidor no inició una sesión válida.');
      }
      _sessionCookie = cookie.split(';').first;
      final user = _decode(response);
      if (user['role'] != 'doctor') {
        await _endServerSession();
        throw Exception('Esta aplicación móvil es exclusiva para el médico.');
      }

      if (!mounted) return;
      setState(() {
        _currentUser = user;
        _password.clear();
        _loggingIn = false;
      });
      await _loadPatients();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _sessionCookie = null;
        _currentUser = null;
        _loggingIn = false;
        _errorMessage = _friendlyError(error);
      });
    }
  }

  void _goToMode(_AppMode mode) {
    setState(() {
      _mode = mode;
      _lookupError = null;
      _errorMessage = null;
      _publicPatient = null;
    });
  }

  void _goHome() {
    FocusScope.of(context).unfocus();
    setState(() {
      _mode = _AppMode.home;
      _lookupDocument.clear();
      _lookupError = null;
      _errorMessage = null;
      _publicPatient = null;
    });
  }

  Future<void> _consultPatientTurn() async {
    final document = _lookupDocument.text.trim();
    if (document.isEmpty) {
      setState(() => _lookupError = 'Escribe el documento del paciente.');
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _lookingUpPatient = true;
      _lookupError = null;
      _publicPatient = null;
    });
    try {
      final response = await http
          .post(
            _uri('/api/patients/quick-consult'),
            headers: const {'Content-Type': 'application/json'},
            body: jsonEncode({'document': document}),
          )
          .timeout(const Duration(seconds: 10));
      if (response.statusCode != 200) {
        throw Exception(_responseMessage(response));
      }
      final patient = _decode(response);
      if (!mounted) return;
      setState(() {
        _publicPatient = patient;
        _lookingUpPatient = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _lookingUpPatient = false;
        _lookupError = _friendlyError(error);
      });
    }
  }

  String _friendlyError(Object error) {
    final message = error.toString().replaceFirst('Exception: ', '');
    if (message.contains('SocketException') ||
        message.contains('Connection refused') ||
        message.contains('Failed host lookup')) {
      return 'No se pudo conectar con ${_serverIp.text.trim()}:$_serverPort. Revisa que el servidor esté iniciado y que el celular y el computador estén en la misma red Wi‑Fi.';
    }
    if (message.contains('TimeoutException')) {
      return 'El servidor tardó demasiado en responder. Comprueba la IP y vuelve a intentar.';
    }
    return message;
  }

  Future<void> _endServerSession() async {
    if (_sessionCookie == null) return;
    try {
      await http
          .post(
            _uri('/api/auth/logout'),
            headers: _headers,
          )
          .timeout(const Duration(seconds: 5));
    } catch (_) {
      // La sesión local se cierra aunque el servidor no responda.
    }
  }

  Future<void> _logout() async {
    await _endServerSession();
    if (!mounted) return;
    setState(() {
      _sessionCookie = null;
      _currentUser = null;
      _patients = [];
      _selectedLevel = '';
      _search.clear();
      _errorMessage = null;
      _busyPatientId = null;
    });
  }

  Future<void> _loadPatients() async {
    if (_sessionCookie == null) return;
    setState(() {
      _loadingPatients = true;
      _errorMessage = null;
    });
    try {
      final response = await http
          .get(
            _uri('/api/mobile/doctor/patients'),
            headers: _headers,
          )
          .timeout(const Duration(seconds: 10));
      if (response.statusCode == 401) {
        await _logout();
        throw Exception('La sesión venció. Inicia sesión otra vez.');
      }
      if (response.statusCode != 200) {
        throw Exception(_responseMessage(response));
      }
      final decoded = jsonDecode(response.body);
      final patients = (decoded as List)
          .whereType<Map>()
          .map((patient) => Map<String, dynamic>.from(patient))
          .toList();
      patients.sort((a, b) {
        final byPriority =
            _intValue(a['priority']).compareTo(_intValue(b['priority']));
        return byPriority != 0
            ? byPriority
            : _stringValue(a['name']).compareTo(_stringValue(b['name']));
      });
      if (!mounted) return;
      setState(() {
        _patients = patients;
        _loadingPatients = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loadingPatients = false;
        _errorMessage = _friendlyError(error);
      });
    }
  }

  Future<void> _markAttended(Map<String, dynamic> patient) async {
    final id = _stringValue(patient['id']);
    if (id.isEmpty || _sessionCookie == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Marcar como atendido'),
        content: Text(
          '¿Confirmas que ${_stringValue(patient['name'])} ya fue atendido?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Confirmar atención'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _busyPatientId = id);
    try {
      final response = await http
          .patch(
            _uri('/api/mobile/doctor/patients/$id/status'),
            headers: _headers,
            body: jsonEncode({'careStatus': 'Atendido'}),
          )
          .timeout(const Duration(seconds: 10));
      if (response.statusCode == 401) {
        await _logout();
        throw Exception('La sesión venció. Inicia sesión otra vez.');
      }
      if (response.statusCode != 200) {
        throw Exception(_responseMessage(response));
      }
      final updated = _decode(response);
      if (!mounted) return;
      setState(() {
        _patients =
            _patients.map((item) => item['id'] == id ? updated : item).toList();
        _busyPatientId = null;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Atención guardada en MongoDB.')),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() => _busyPatientId = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_friendlyError(error))),
      );
    }
  }

  Future<void> _showServerSettings() async {
    final controller = TextEditingController(text: _serverIp.text);
    final updatedIp = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Servidor trIAje'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Emulador Android: 10.0.2.2. Celular físico: escribe la IP local del computador; ambos deben usar la misma red Wi‑Fi.',
              style: TextStyle(fontSize: 13, height: 1.45),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: controller,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'IP o nombre del computador',
                hintText: 'Ej. 192.168.1.25',
                prefixIcon: Icon(Icons.router_outlined),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () =>
                Navigator.pop(dialogContext, controller.text.trim()),
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
    if (updatedIp == null || updatedIp.isEmpty || !mounted) return;
    if (_currentUser != null) await _logout();
    setState(() {
      _serverIp.text =
          updatedIp.replaceFirst(RegExp(r'^https?://'), '').split(':').first;
      _errorMessage = null;
    });
  }

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    _search.dispose();
    _serverIp.dispose();
    _lookupDocument.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = _currentUser != null;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        leading: !signedIn && _mode != _AppMode.home
            ? IconButton(
                tooltip: 'Volver al inicio',
                onPressed: _goHome,
                icon: const Icon(Icons.arrow_back),
              )
            : null,
        title: Row(
          children: [
            const _BrandMark(),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('trIAje',
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: _ink,
                        fontSize: 17)),
                Text(
                  signedIn
                      ? 'Panel médico móvil'
                      : _mode == _AppMode.patient
                          ? 'Consulta de turno'
                          : _mode == _AppMode.doctor
                              ? 'Acceso médico'
                              : 'Pacientes y equipo médico',
                  style: const TextStyle(color: _muted, fontSize: 10),
                ),
              ],
            ),
          ],
        ),
        actions: [
          if (signedIn)
            IconButton(
              tooltip: 'Actualizar pacientes',
              onPressed: _loadingPatients ? null : _loadPatients,
              icon: const Icon(Icons.refresh),
            ),
          IconButton(
            tooltip: 'Configurar servidor',
            onPressed: _showServerSettings,
            icon: const Icon(Icons.settings_ethernet_outlined, color: _primary),
          ),
          if (signedIn)
            IconButton(
              tooltip: 'Cerrar sesión',
              onPressed: _logout,
              icon: const Icon(Icons.logout, color: _muted),
            ),
          const SizedBox(width: 4),
        ],
      ),
      body: signedIn
          ? _buildDoctorPanel()
          : _mode == _AppMode.patient
              ? _buildPatientLookup()
              : _mode == _AppMode.doctor
                  ? _buildLogin()
                  : _buildAccessChoice(),
    );
  }

  Widget _buildAccessChoice() {
    return SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _BrandMark(),
                const SizedBox(height: 16),
                const Text('Bienvenido a trIAje',
                    style: TextStyle(
                        fontSize: 25,
                        fontWeight: FontWeight.w900,
                        color: _ink)),
                const SizedBox(height: 6),
                const Text('Elige cómo quieres ingresar desde esta aplicación.',
                    style: TextStyle(fontSize: 13, height: 1.4, color: _muted)),
                const SizedBox(height: 20),
                _AccessCard(
                  icon: Icons.confirmation_number_outlined,
                  title: 'Consulta de paciente',
                  description:
                      'Consulta el nivel, el estado de atención y tu turno con el documento registrado.',
                  buttonText: 'Consultar mi turno',
                  onPressed: () => _goToMode(_AppMode.patient),
                ),
                const SizedBox(height: 12),
                _AccessCard(
                  icon: Icons.medical_services_outlined,
                  title: 'Acceso del médico',
                  description:
                      'Revisa la cola, consulta los registros y marca las atenciones completadas.',
                  buttonText: 'Ingresar como médico',
                  onPressed: () => _goToMode(_AppMode.doctor),
                  primary: true,
                ),
                const SizedBox(height: 16),
                Text(
                  'Servidor: ${_serverIp.text}:$_serverPort · Configúralo con el icono de conexión.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 11, color: _muted),
                ),
                const SizedBox(height: 8),
                const Text('Prototipo académico: utiliza solo datos ficticios.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 10, color: _muted)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildPatientLookup() {
    return SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Card(
                  color: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                      side: const BorderSide(color: _line)),
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Icon(Icons.confirmation_number_outlined,
                            size: 38, color: _primary),
                        const SizedBox(height: 10),
                        const Text('Consulta tu turno',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                                fontSize: 21,
                                fontWeight: FontWeight.w800,
                                color: _ink)),
                        const SizedBox(height: 6),
                        const Text(
                            'Escribe el documento que se registró al ingresar a urgencias.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                                fontSize: 12, height: 1.4, color: _muted)),
                        const SizedBox(height: 18),
                        TextField(
                          controller: _lookupDocument,
                          keyboardType: TextInputType.text,
                          autocorrect: false,
                          onSubmitted: (_) =>
                              _lookingUpPatient ? null : _consultPatientTurn(),
                          decoration: const InputDecoration(
                            labelText: 'Documento del paciente',
                            hintText: 'Ej. DEMO-101',
                            prefixIcon: Icon(Icons.badge_outlined),
                          ),
                        ),
                        if (_lookupError != null) ...[
                          const SizedBox(height: 12),
                          _ErrorBox(message: _lookupError!),
                        ],
                        const SizedBox(height: 14),
                        FilledButton.icon(
                          onPressed:
                              _lookingUpPatient ? null : _consultPatientTurn,
                          icon: _lookingUpPatient
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.search),
                          label: Text(_lookingUpPatient
                              ? 'Buscando…'
                              : 'Consultar turno'),
                          style: FilledButton.styleFrom(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 13)),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 13),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 420),
                  switchInCurve: Curves.easeOutCubic,
                  switchOutCurve: Curves.easeInCubic,
                  transitionBuilder: (child, animation) => FadeTransition(
                    opacity: animation,
                    child: SlideTransition(
                      position: Tween<Offset>(
                        begin: const Offset(0, .08),
                        end: Offset.zero,
                      ).animate(animation),
                      child: child,
                    ),
                  ),
                  child: _publicPatient == null
                      ? const SizedBox.shrink(
                          key: ValueKey('empty-patient-result'))
                      : _PatientTurnCard(
                          key: ValueKey(
                            '${_lookupDocument.text.trim()}-${_publicPatient!['careStatus']}',
                          ),
                          patient: _publicPatient!,
                          searchedDocument: _lookupDocument.text,
                        ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Se muestran el nombre, el documento parcialmente oculto, el nivel y el turno. Los motivos, observaciones y signos vitales solo están disponibles para el personal médico autorizado.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 10, height: 1.45, color: _muted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLogin() {
    return SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Card(
              color: Colors.white,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
                side: const BorderSide(color: _line),
              ),
              child: Padding(
                padding: const EdgeInsets.all(22),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Icon(Icons.medical_services_outlined,
                          size: 42, color: _primary),
                      const SizedBox(height: 12),
                      const Text(
                        'Acceso del médico',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: _ink),
                      ),
                      const SizedBox(height: 7),
                      const Text(
                        'Inicia sesión con la cuenta médica registrada en trIAje para consultar la cola y actualizar atenciones.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 13, height: 1.45, color: _muted),
                      ),
                      const SizedBox(height: 22),
                      TextFormField(
                        controller: _username,
                        textInputAction: TextInputAction.next,
                        autocorrect: false,
                        decoration: const InputDecoration(
                            labelText: 'Usuario',
                            prefixIcon: Icon(Icons.person_outline)),
                        validator: (value) =>
                            (value == null || value.trim().isEmpty)
                                ? 'Escribe tu usuario.'
                                : null,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _password,
                        obscureText: _obscurePassword,
                        onFieldSubmitted: (_) => _loggingIn ? null : _login(),
                        decoration: InputDecoration(
                          labelText: 'Contraseña',
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(
                            tooltip: _obscurePassword
                                ? 'Mostrar contraseña'
                                : 'Ocultar contraseña',
                            onPressed: () => setState(
                                () => _obscurePassword = !_obscurePassword),
                            icon: Icon(_obscurePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined),
                          ),
                        ),
                        validator: (value) => (value == null || value.isEmpty)
                            ? 'Escribe tu contraseña.'
                            : null,
                      ),
                      if (_errorMessage != null) ...[
                        const SizedBox(height: 12),
                        _ErrorBox(message: _errorMessage!),
                      ],
                      const SizedBox(height: 16),
                      FilledButton.icon(
                        onPressed: _loggingIn ? null : _login,
                        icon: _loggingIn
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2, color: Colors.white))
                            : const Icon(Icons.login),
                        label:
                            Text(_loggingIn ? 'Ingresando…' : 'Iniciar sesión'),
                        style: FilledButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 14)),
                      ),
                      const SizedBox(height: 14),
                      const Text(
                        'Acceso exclusivo para cuentas con rol Médico. Los registros solo se cargan después de iniciar sesión.',
                        textAlign: TextAlign.center,
                        style:
                            TextStyle(fontSize: 11, height: 1.4, color: _muted),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Servidor: ${_serverIp.text}:$_serverPort',
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontSize: 11, color: _muted),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildDoctorPanel() {
    final userName = _stringValue(_currentUser?['fullName']);
    final term = _search.text.trim().toLowerCase();
    final visible = _patients.where((patient) {
      final levelMatch = _selectedLevel.isEmpty ||
          _intValue(patient['priority']) == int.parse(_selectedLevel);
      final searchMatch = term.isEmpty ||
          '${_stringValue(patient['name'])} ${_stringValue(patient['document'])} ${_stringValue(patient['condition'])}'
              .toLowerCase()
              .contains(term);
      return levelMatch && searchMatch;
    }).toList();
    final waitingCount =
        _patients.where((p) => p['careStatus'] == 'Pendiente').length;

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: _loadPatients,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 30),
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('PANEL MÉDICO',
                          style: TextStyle(
                              fontSize: 10,
                              letterSpacing: 1.4,
                              fontWeight: FontWeight.w800,
                              color: _primary)),
                      const SizedBox(height: 4),
                      Text('Hola, $userName',
                          style: const TextStyle(
                              fontSize: 21,
                              fontWeight: FontWeight.w800,
                              color: _ink)),
                      const SizedBox(height: 3),
                      const Text('Consulta la cola y registra las atenciones.',
                          style: TextStyle(fontSize: 12, color: _muted)),
                    ],
                  ),
                ),
                _WaitingCounter(count: waitingCount),
              ],
            ),
            const SizedBox(height: 17),
            TextField(
              controller: _search,
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                hintText: 'Buscar por paciente, documento o motivo',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        onPressed: () {
                          _search.clear();
                          setState(() {});
                        },
                        icon: const Icon(Icons.close)),
              ),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              initialValue: _selectedLevel,
              decoration: const InputDecoration(
                  labelText: 'Filtrar nivel de triaje',
                  prefixIcon: Icon(Icons.filter_list)),
              items: const [
                DropdownMenuItem(value: '', child: Text('Todos los niveles')),
                DropdownMenuItem(
                    value: '1', child: Text('Nivel 1 · Inmediato')),
                DropdownMenuItem(
                    value: '2', child: Text('Nivel 2 · Muy urgente')),
                DropdownMenuItem(value: '3', child: Text('Nivel 3 · Urgente')),
                DropdownMenuItem(
                    value: '4', child: Text('Nivel 4 · Menos urgente')),
                DropdownMenuItem(
                    value: '5', child: Text('Nivel 5 · No urgente')),
              ],
              onChanged: (value) =>
                  setState(() => _selectedLevel = value ?? ''),
            ),
            const SizedBox(height: 17),
            Row(
              children: [
                const Expanded(
                    child: Text('Pacientes registrados',
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: _ink))),
                Text('${visible.length} de ${_patients.length}',
                    style: const TextStyle(fontSize: 11, color: _muted)),
              ],
            ),
            const SizedBox(height: 9),
            if (_errorMessage != null) ...[
              _ErrorBox(message: _errorMessage!),
              const SizedBox(height: 10),
            ],
            if (_loadingPatients && _patients.isEmpty)
              const Padding(
                  padding: EdgeInsets.symmetric(vertical: 46),
                  child: Center(child: CircularProgressIndicator()))
            else if (visible.isEmpty)
              _EmptyState(
                title: _patients.isEmpty
                    ? 'No hay pacientes registrados'
                    : 'No hay coincidencias',
                message: _patients.isEmpty
                    ? 'Desliza hacia abajo para actualizar la lista.'
                    : 'Prueba otra búsqueda o cambia el nivel.',
              )
            else
              ...visible.map(_patientCard),
            const SizedBox(height: 12),
            const Text(
              'Datos del prototipo académico. Usa registros ficticios para la demostración.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 10, color: _muted),
            ),
          ],
        ),
      ),
    );
  }

  Widget _patientCard(Map<String, dynamic> patient) {
    final id = _stringValue(patient['id']);
    final pending = patient['careStatus'] == 'Pendiente';
    final priority = _intValue(patient['priority']);
    final priorityColor = _priorityColor(priority);
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(15),
        side: const BorderSide(color: _line),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(15),
        onTap: () => _showPatientDetails(patient),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                            _stringValue(
                                patient['name'], 'Paciente sin nombre'),
                            style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                color: _ink)),
                        const SizedBox(height: 3),
                        Text(
                            'Documento: ${_stringValue(patient['document'], '—')}',
                            style:
                                const TextStyle(fontSize: 11, color: _muted)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
                    decoration: BoxDecoration(
                        color: priorityColor.withValues(alpha: .11),
                        borderRadius: BorderRadius.circular(8)),
                    child: Text('Nivel $priority',
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: priorityColor)),
                  ),
                ],
              ),
              const SizedBox(height: 11),
              Text(_stringValue(patient['condition'], 'Sin motivo reportado'),
                  style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF465368))),
              const SizedBox(height: 10),
              Row(
                children: [
                  _StatusPill(pending: pending),
                  const Spacer(),
                  const Text('Ver detalles',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: _primary)),
                  const SizedBox(width: 3),
                  const Icon(Icons.chevron_right, size: 18, color: _primary),
                ],
              ),
              if (pending) ...[
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: _busyPatientId == id
                        ? null
                        : () => _markAttended(patient),
                    icon: _busyPatientId == id
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.check_circle_outline, size: 18),
                    label: Text(_busyPatientId == id
                        ? 'Guardando…'
                        : 'Marcar como atendido'),
                    style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 11)),
                  ),
                ),
              ]
            ],
          ),
        ),
      ),
    );
  }

  void _showPatientDetails(Map<String, dynamic> patient) {
    final priority = _intValue(patient['priority']);
    final vitals = <String>[
      if (_hasValue(patient['bloodPressure'])) 'TA ${patient['bloodPressure']}',
      if (_hasValue(patient['pulse'])) 'Pulso ${patient['pulse']} lpm',
      if (_hasValue(patient['respiratoryRate']))
        'FR ${patient['respiratoryRate']} rpm',
      if (_hasValue(patient['temperature']))
        'Temp. ${patient['temperature']} °C',
      if (_hasValue(patient['oxygen'])) 'O₂ ${patient['oxygen']}%',
    ];
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: const Color(0xFFF8FAFC),
      builder: (sheetContext) => SafeArea(
        child: DraggableScrollableSheet(
          expand: false,
          initialChildSize: .78,
          maxChildSize: .94,
          builder: (context, controller) => ListView(
            controller: controller,
            padding: const EdgeInsets.fromLTRB(18, 4, 18, 24),
            children: [
              Row(children: [
                Expanded(
                    child: Text(_stringValue(patient['name']),
                        style: const TextStyle(
                            fontSize: 21,
                            fontWeight: FontWeight.w800,
                            color: _ink))),
                _StatusPill(pending: patient['careStatus'] == 'Pendiente'),
              ]),
              const SizedBox(height: 5),
              Text(
                  'Nivel $priority · Documento ${_stringValue(patient['document'], '—')}',
                  style: TextStyle(
                      color: _priorityColor(priority),
                      fontWeight: FontWeight.w700,
                      fontSize: 12)),
              const SizedBox(height: 17),
              _DetailTile(
                  label: 'Edad y género',
                  value:
                      '${_stringValue(patient['age'], '—')} años · ${_stringValue(patient['gender'], '—')}'),
              _DetailTile(
                  label: 'Motivo de consulta',
                  value: _stringValue(
                      patient['condition'], 'Sin motivo reportado')),
              _DetailTile(
                  label: 'Observaciones',
                  value: _stringValue(
                      patient['description'], 'Sin observaciones')),
              _DetailTile(
                  label: 'Signos vitales',
                  value:
                      vitals.isEmpty ? 'No registrados' : vitals.join(' · ')),
              _DetailTile(
                  label: 'Médico asignado',
                  value: _stringValue(
                      patient['attendedBy'] is Map
                          ? (patient['attendedBy'] as Map)['name']
                          : patient['doctor'],
                      'Por asignar')),
              _DetailTile(
                  label: 'Registró',
                  value: _stringValue(
                      patient['registeredBy'] is Map
                          ? (patient['registeredBy'] as Map)['name']
                          : null,
                      'Sin dato')),
              _DetailTile(
                  label: 'Registrado',
                  value: _formatDate(patient['createdAt'])),
              if (patient['careStatus'] == 'Atendido')
                _DetailTile(
                    label: 'Atendido por',
                    value: _stringValue(
                        patient['attendedBy'] is Map
                            ? (patient['attendedBy'] as Map)['name']
                            : null,
                        _stringValue(patient['doctor'], 'Sin dato'))),
              if (patient['careStatus'] == 'Pendiente') ...[
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: _busyPatientId == _stringValue(patient['id'])
                      ? null
                      : () {
                          Navigator.pop(sheetContext);
                          _markAttended(patient);
                        },
                  icon: const Icon(Icons.check_circle_outline),
                  label: const Text('Marcar como atendido'),
                  style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 13)),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(dynamic value) {
    if (value == null) return 'Sin fecha';
    final date = DateTime.tryParse(value.toString());
    if (date == null) return value.toString();
    final local = date.toLocal();
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(local.day)}/${two(local.month)}/${local.year} ${two(local.hour)}:${two(local.minute)}';
  }

  int _intValue(dynamic value) => int.tryParse(value?.toString() ?? '') ?? 5;

  bool _hasValue(dynamic value) =>
      value != null && value.toString().trim().isNotEmpty;

  String _stringValue(dynamic value, [String fallback = '—']) {
    if (value == null || value.toString().trim().isEmpty) return fallback;
    return value.toString();
  }

  Color _priorityColor(int priority) => switch (priority) {
        1 => const Color(0xFFDC2626),
        2 => const Color(0xFFEA580C),
        3 => const Color(0xFFCA8A04),
        4 => const Color(0xFF16A34A),
        5 => const Color(0xFF2563EB),
        _ => _primary,
      };
}

class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) => Container(
        width: 34,
        height: 34,
        alignment: Alignment.center,
        decoration: BoxDecoration(
            color: _primary, borderRadius: BorderRadius.circular(10)),
        child: const Text('t',
            style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w800)),
      );
}

class _AccessCard extends StatelessWidget {
  const _AccessCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.buttonText,
    required this.onPressed,
    this.primary = false,
  });

  final IconData icon;
  final String title;
  final String description;
  final String buttonText;
  final VoidCallback onPressed;
  final bool primary;

  @override
  Widget build(BuildContext context) => Card(
        color: Colors.white,
        elevation: 0,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: _line)),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                    color: const Color(0xFFEEF1FF),
                    borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: _primary),
              ),
              const SizedBox(width: 11),
              Expanded(
                  child: Text(title,
                      style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: _ink))),
            ]),
            const SizedBox(height: 10),
            Text(description,
                style:
                    const TextStyle(fontSize: 12, height: 1.45, color: _muted)),
            const SizedBox(height: 13),
            primary
                ? FilledButton(onPressed: onPressed, child: Text(buttonText))
                : OutlinedButton(onPressed: onPressed, child: Text(buttonText)),
          ]),
        ),
      );
}

class _PatientTurnCard extends StatelessWidget {
  const _PatientTurnCard({
    super.key,
    required this.patient,
    required this.searchedDocument,
  });

  final Map<String, dynamic> patient;
  final String searchedDocument;

  @override
  Widget build(BuildContext context) {
    final pending = patient['careStatus'] == 'Pendiente';
    final priority = int.tryParse(patient['priority']?.toString() ?? '') ?? 5;
    final queuePosition = patient['queuePosition']?.toString() ?? '—';
    final totalWaiting = patient['totalWaiting']?.toString() ?? '0';
    final statusColor =
        pending ? const Color(0xFFB42318) : const Color(0xFF047857);
    final statusSurface =
        pending ? const Color(0xFFFFF1F0) : const Color(0xFFECFDF3);
    final statusBorder =
        pending ? const Color(0xFFFECACA) : const Color(0xFFA7F3D0);
    final priorityColor = switch (priority) {
      1 => const Color(0xFFB42318),
      2 => const Color(0xFFDC6803),
      3 => const Color(0xFFB54708),
      4 => const Color(0xFF15803D),
      5 => const Color(0xFF2563EB),
      _ => _primary,
    };
    final document = searchedDocument.trim();
    final maskedDocument = document.length <= 4
        ? List.filled(document.length, '•').join()
        : '${List.filled(document.length - 4, '•').join()}${document.substring(document.length - 4)}';

    return AnimatedContainer(
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
      padding: const EdgeInsets.all(17),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: statusBorder, width: 1.4),
        boxShadow: [
          BoxShadow(
              color: statusColor.withValues(alpha: .08),
              blurRadius: 20,
              offset: const Offset(0, 8)),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 350),
            width: 44,
            height: 44,
            decoration: BoxDecoration(
                color: statusSurface, borderRadius: BorderRadius.circular(14)),
            child: Icon(
                pending
                    ? Icons.hourglass_top_rounded
                    : Icons.check_circle_rounded,
                color: statusColor,
                size: 25),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 320),
              transitionBuilder: (child, animation) => FadeTransition(
                opacity: animation,
                child: SlideTransition(
                  position: Tween<Offset>(
                          begin: const Offset(0, .08), end: Offset.zero)
                      .animate(animation),
                  child: child,
                ),
              ),
              child: Column(
                key: ValueKey(pending),
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(pending ? 'PACIENTE EN ESPERA' : 'ATENCIÓN COMPLETADA',
                      style: TextStyle(
                          fontSize: 9,
                          letterSpacing: 1.0,
                          fontWeight: FontWeight.w900,
                          color: statusColor)),
                  const SizedBox(height: 3),
                  Text(
                      pending
                          ? 'Tu atención está pendiente'
                          : 'Tu atención ya fue registrada',
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF344054))),
                ],
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
            decoration: BoxDecoration(
                color: priorityColor.withValues(alpha: .1),
                borderRadius: BorderRadius.circular(9)),
            child: Text('Nivel $priority',
                style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    color: priorityColor)),
          ),
        ]),
        const SizedBox(height: 17),
        Text(patient['name']?.toString() ?? 'Paciente',
            style: const TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.w900,
                color: Color(0xFF182334))),
        const SizedBox(height: 4),
        Row(children: [
          const Icon(Icons.badge_outlined, size: 14, color: Color(0xFF98A2B3)),
          const SizedBox(width: 5),
          Text('Documento: $maskedDocument',
              style: const TextStyle(fontSize: 11, color: Color(0xFF667085))),
        ]),
        const SizedBox(height: 15),
        AnimatedContainer(
          duration: const Duration(milliseconds: 420),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.all(15),
          decoration: BoxDecoration(
              color: statusSurface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: statusBorder)),
          child: Row(children: [
            Expanded(
                child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 360),
              transitionBuilder: (child, animation) => FadeTransition(
                  opacity: animation,
                  child: ScaleTransition(
                      scale:
                          Tween<double>(begin: .96, end: 1).animate(animation),
                      child: child)),
              child: Column(
                key: ValueKey(pending),
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                      pending ? 'Tu turno aproximado' : 'Estado de tu atención',
                      style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: statusColor)),
                  const SizedBox(height: 3),
                  Text(pending ? 'Cupo #$queuePosition' : 'Atendido',
                      style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          color: statusColor)),
                  const SizedBox(height: 2),
                  Text(
                      pending
                          ? 'Puesto $queuePosition de $totalWaiting en espera'
                          : 'La atención figura como completada',
                      style: const TextStyle(
                          fontSize: 10, color: Color(0xFF667085))),
                ],
              ),
            )),
            Icon(
                pending
                    ? Icons.notifications_active_outlined
                    : Icons.verified_rounded,
                color: statusColor,
                size: 29),
          ]),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
          decoration: BoxDecoration(
              color: statusSurface, borderRadius: BorderRadius.circular(9)),
          child: Row(children: [
            Icon(
                pending
                    ? Icons.schedule_rounded
                    : Icons.check_circle_outline_rounded,
                color: statusColor,
                size: 16),
            const SizedBox(width: 7),
            const Text('Estado',
                style: TextStyle(fontSize: 11, color: Color(0xFF667085))),
            const Spacer(),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 260),
              child: Text(pending ? 'Pendiente' : 'Atendido',
                  key: ValueKey(pending),
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      color: statusColor)),
            ),
          ]),
        ),
      ]),
    );
  }
}

class _WaitingCounter extends StatelessWidget {
  const _WaitingCounter({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
            color: const Color(0xFFEEF1FF),
            borderRadius: BorderRadius.circular(12)),
        child: Column(children: [
          Text('$count',
              style: const TextStyle(
                  color: _primary, fontSize: 20, fontWeight: FontWeight.w900)),
          const Text('en espera', style: TextStyle(color: _muted, fontSize: 9)),
        ]),
      );
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.pending});
  final bool pending;

  @override
  Widget build(BuildContext context) {
    final color = pending ? const Color(0xFFB45309) : const Color(0xFF087F5B);
    final background =
        pending ? const Color(0xFFFFF7E6) : const Color(0xFFE9F8F1);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
          color: background, borderRadius: BorderRadius.circular(20)),
      child: Text(pending ? 'Pendiente' : 'Atendido',
          style: TextStyle(
              color: color, fontSize: 10, fontWeight: FontWeight.w800)),
    );
  }
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
            color: const Color(0xFFFFF1F0),
            borderRadius: BorderRadius.circular(11),
            border: Border.all(color: const Color(0xFFF3C5C2))),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.error_outline, color: Color(0xFFB54746), size: 19),
          const SizedBox(width: 8),
          Expanded(
              child: Text(message,
                  style: const TextStyle(
                      color: Color(0xFF8F3433), fontSize: 12, height: 1.4))),
        ]),
      );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.title, required this.message});
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 12),
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 28),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: _line)),
        child: Column(children: [
          const Icon(Icons.inbox_outlined, size: 34, color: Color(0xFF98A2B3)),
          const SizedBox(height: 9),
          Text(title,
              style: const TextStyle(fontWeight: FontWeight.w800, color: _ink)),
          const SizedBox(height: 4),
          Text(message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12, height: 1.4, color: _muted)),
        ]),
      );
}

class _DetailTile extends StatelessWidget {
  const _DetailTile({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: Color(0xFFEDF0F4)))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 10, color: _muted)),
          const SizedBox(height: 4),
          Text(value,
              style: const TextStyle(
                  fontSize: 13,
                  color: _ink,
                  height: 1.35,
                  fontWeight: FontWeight.w600)),
        ]),
      );
}
