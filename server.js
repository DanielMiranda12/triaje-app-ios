require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const databaseName = process.env.MONGODB_DB || 'triaje_demo';
const client = new MongoClient(mongoUri);
let patientsCollection;
let usersCollection;
let rolesCollection;

app.use(express.json({ limit: '2mb' }));
app.use(session({
  name: 'triaje.sid',
  secret: process.env.SESSION_SECRET || 'clave-local-solo-para-prototipo-triaje',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(__dirname));

const roleDefinitions = [
  { code: 'admin', name: 'Administrador', description: 'Administra usuarios, roles y registros del prototipo.' },
  { code: 'nurse', name: 'Jefe de enfermería', description: 'Registra pacientes y datos de triaje.' },
  { code: 'doctor', name: 'Médico', description: 'Consulta pacientes y actualiza su atención médica.' },
  { code: 'patient', name: 'Paciente', description: 'Consulta únicamente su propio estado de atención.' }
];

const initialUsers = [
  { fullName: 'Administrador de demostración', username: 'admin', password: 'admin123', role: 'admin' },
  { fullName: 'Enfermería de demostración', username: 'enfermeria', password: 'enfermeria123', role: 'nurse' },
  { fullName: 'Médico de demostración', username: 'medico', password: 'medico123', role: 'doctor' },
  { fullName: 'Paciente Demo A', username: 'DEMO-101', password: 'paciente123', role: 'patient', patientDocument: 'DEMO-101' }
];

function normalized(value) { return String(value ?? '').trim().toLocaleLowerCase('es'); }
function normalizedName(value) { return normalized(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' '); }

function publicUser(user) {
  return {
    id: user._id.toString(), fullName: user.fullName, username: user.username,
    role: user.role, roleName: roleDefinitions.find((role) => role.code === user.role)?.name || user.role,
    patientDocument: user.patientDocument || null, isActive: user.isActive !== false
  };
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  next();
}

function allowRoles(...allowed) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    if (!allowed.includes(req.session.user.role)) return res.status(403).json({ error: 'Tu rol no tiene permiso para esta acción.' });
    next();
  };
}

function actorSnapshot(user) {
  return { userId: user.id, username: user.username, name: user.fullName, role: user.role, roleName: user.roleName };
}

function text(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function patientFromInput(input) {
  const patient = {
    name: text(input.name, 120),
    document: text(input.document, 40),
    age: Number(input.age),
    gender: text(input.gender, 40),
    condition: text(input.condition, 160),
    description: text(input.description, 1000),
    priority: Number(input.priority),
    bloodPressure: text(input.bloodPressure, 30),
    pulse: text(input.pulse, 10),
    respiratoryRate: text(input.respiratoryRate, 10),
    temperature: text(input.temperature, 10),
    oxygen: text(input.oxygen, 10),
    careStatus: ['Pendiente', 'Atendido'].includes(input.careStatus) ? input.careStatus : 'Pendiente',
    doctor: text(input.doctor || 'Por asignar', 120)
  };
  patient.documentKey = patient.document.toLocaleLowerCase('es');

  if (!patient.name || !patient.document || !patient.gender) {
    const error = new Error('Nombre, documento y género son obligatorios.');
    error.status = 400;
    throw error;
  }
  if (!Number.isInteger(patient.age) || patient.age < 0 || patient.age > 120) {
    const error = new Error('La edad debe ser un número entre 0 y 120.');
    error.status = 400;
    throw error;
  }
  if (!Number.isInteger(patient.priority) || patient.priority < 1 || patient.priority > 5) {
    const error = new Error('El nivel de triaje debe estar entre 1 y 5.');
    error.status = 400;
    throw error;
  }
  return patient;
}

function publicPatient(document) {
  const { _id, documentKey, ...patient } = document;
  return { ...patient, id: _id.toString() };
}

function isDuplicateError(error) {
  return error && error.code === 11000;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: databaseName });
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const usernameInput = String(req.body.username || '').trim();
    const usernameKey = normalized(usernameInput);
    const passwordInput = String(req.body.password || '');
    let user = await usersCollection.findOne({ usernameKey });

    // Si no es un usuario registrado en usersCollection, permitir también iniciar sesión
    // a cualquier paciente registrado en urgencias por su documento:
    if (!user) {
      const patient = await patientsCollection.findOne({ documentKey: usernameKey });
      if (patient) {
        if (passwordInput === 'paciente123' || passwordInput.toLowerCase() === patient.document.toLowerCase()) {
          user = {
            _id: new ObjectId(),
            fullName: patient.name,
            username: patient.document,
            role: 'patient',
            patientDocument: patient.document,
            isActive: true
          };
        }
      }
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    if (user.passwordHash && !(await bcrypt.compare(passwordInput, user.passwordHash))) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.user = publicUser(user);
    res.json(req.session.user);
  } catch (error) { next(error); }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'No hay una sesión activa.' });
  res.json(req.session.user);
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('triaje.sid');
    res.status(204).end();
  });
});

app.get('/api/roles', allowRoles('admin'), async (req, res, next) => {
  try { res.json(await rolesCollection.find({}).sort({ code: 1 }).toArray()); }
  catch (error) { next(error); }
});

app.get('/api/users', allowRoles('admin'), async (req, res, next) => {
  try {
    const users = await usersCollection.find({}, { projection: { passwordHash: 0, usernameKey: 0 } }).sort({ role: 1, fullName: 1 }).toArray();
    res.json(users.map(publicUser));
  } catch (error) { next(error); }
});

app.post('/api/users', allowRoles('admin'), async (req, res, next) => {
  try {
    const fullName = text(req.body.fullName, 120);
    const username = text(req.body.username, 60);
    const password = String(req.body.password || '');
    const role = text(req.body.role, 20);
    const patientDocument = text(req.body.patientDocument, 40);
    if (!fullName || !username || password.length < 8 || !roleDefinitions.some((item) => item.code === role)) {
      return res.status(400).json({ error: 'Completa nombre, usuario y rol; la contraseña debe tener al menos 8 caracteres.' });
    }
    if (role === 'patient' && !patientDocument) return res.status(400).json({ error: 'Para el rol paciente debes indicar el documento que vincula su registro.' });
    const user = {
      fullName, username, usernameKey: normalized(username), passwordHash: await bcrypt.hash(password, 10),
      role, isActive: true, createdAt: new Date(), createdBy: actorSnapshot(req.session.user),
      ...(role === 'patient' ? { patientDocument, patientDocumentKey: normalized(patientDocument) } : {})
    };
    const result = await usersCollection.insertOne(user);
    res.status(201).json(publicUser({ ...user, _id: result.insertedId }));
  } catch (error) {
    if (isDuplicateError(error)) return res.status(409).json({ error: 'Ese nombre de usuario ya está registrado.' });
    next(error);
  }
});

app.get('/api/patients', allowRoles('admin', 'nurse', 'doctor'), async (req, res, next) => {
  try {
    const docs = await patientsCollection.find({}).sort({ priority: 1, name: 1 }).toArray();
    res.json(docs.map(publicPatient));
  } catch (error) { next(error); }
});

// Endpoints del panel móvil: el servidor solo permite el rol médico.
app.get('/api/mobile/doctor/patients', allowRoles('doctor'), async (req, res, next) => {
  try {
    const docs = await patientsCollection.find({}).sort({ priority: 1, name: 1 }).toArray();
    res.json(docs.map(publicPatient));
  } catch (error) { next(error); }
});

app.patch('/api/mobile/doctor/patients/:id/status', allowRoles('doctor'), async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Identificador inválido.' });
    if (req.body.careStatus !== 'Atendido') {
      return res.status(400).json({ error: 'Desde la aplicación móvil solo se puede marcar como Atendido.' });
    }

    const now = new Date();
    const result = await patientsCollection.findOneAndUpdate(
      { _id: new ObjectId(req.params.id), careStatus: 'Pendiente' },
      { $set: {
        careStatus: 'Atendido',
        attendedBy: actorSnapshot(req.session.user),
        doctor: req.session.user.fullName,
        updatedAt: now
      } },
      { returnDocument: 'after' }
    );

    if (!result) {
      const existing = await patientsCollection.findOne({ _id: new ObjectId(req.params.id) }, { projection: { careStatus: 1 } });
      if (!existing) return res.status(404).json({ error: 'No se encontró el paciente.' });
      return res.status(409).json({ error: 'Este paciente ya fue marcado como atendido.' });
    }
    res.json(publicPatient(result));
  } catch (error) { next(error); }
});

app.get('/api/patients/mine', allowRoles('patient'), async (req, res, next) => {
  try {
    const documentKey = normalized(req.session.user.patientDocument || req.session.user.username);
    const patient = await patientsCollection.findOne({ documentKey });
    if (!patient) return res.json(null);
    let queuePosition = null;
    let totalWaiting = 0;
    if (patient.careStatus === 'Pendiente') {
      const pending = await patientsCollection.find(
        { careStatus: 'Pendiente' },
        { projection: { _id: 1, name: 1, priority: 1 } }
      ).toArray();
      pending.sort((a, b) => Number(a.priority) - Number(b.priority) || a.name.localeCompare(b.name, 'es'));
      queuePosition = pending.findIndex((record) => record._id.equals(patient._id)) + 1;
      totalWaiting = pending.length;
    }
    res.json({ ...publicPatient(patient), queuePosition, totalWaiting });
  } catch (error) { next(error); }
});

app.post('/api/patients/quick-consult', async (req, res, next) => {
  try {
    const documentInput = text(req.body.document || req.body.identity, 40);
    if (!documentInput) {
      return res.status(400).json({ error: 'Ingresa el número de documento del paciente.' });
    }

    const documentKey = normalized(documentInput);
    const patient = await patientsCollection.findOne({ documentKey });
    if (!patient) {
      return res.status(404).json({ error: 'No se encontró ningún paciente con el documento: ' + documentInput });
    }

    let queuePosition = null;
    let totalWaiting = 0;
    if (patient.careStatus === 'Pendiente') {
      const pending = await patientsCollection.find(
        { careStatus: 'Pendiente' },
        { projection: { _id: 1, name: 1, priority: 1 } }
      ).toArray();
      pending.sort((a, b) => Number(a.priority) - Number(b.priority) || a.name.localeCompare(b.name, 'es'));
      queuePosition = pending.findIndex((record) => record._id.equals(patient._id)) + 1;
      totalWaiting = pending.length;
    }
    // La consulta pública solo devuelve datos necesarios para ubicar el turno.
    // Los datos clínicos completos se consultan con sesión y rol autorizado.
    res.json({
      name: patient.name,
      priority: patient.priority,
      careStatus: patient.careStatus,
      queuePosition,
      totalWaiting,
      doctor: patient.doctor,
      attendedBy: patient.attendedBy ?? null
    });
  } catch (error) { next(error); }
});

app.post('/api/patients', allowRoles('admin', 'nurse'), async (req, res, next) => {
  try {
    const patient = patientFromInput(req.body);
    patient.registeredBy = actorSnapshot(req.session.user);
    patient.attendedBy = null;
    patient.createdAt = new Date();
    patient.updatedAt = patient.createdAt;
    const result = await patientsCollection.insertOne(patient);
    res.status(201).json(publicPatient({ ...patient, _id: result.insertedId }));
  } catch (error) {
    if (isDuplicateError(error)) return res.status(409).json({ error: 'Ya existe un paciente con ese documento.' });
    next(error);
  }
});

app.put('/api/patients/:id', allowRoles('admin', 'nurse'), async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Identificador inválido.' });
    const patient = patientFromInput(req.body);
    patient.updatedAt = new Date();
    const result = await patientsCollection.findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: patient },
      { returnDocument: 'after' }
    );
    if (!result) return res.status(404).json({ error: 'No se encontró el paciente.' });
    res.json(publicPatient(result));
  } catch (error) {
    if (isDuplicateError(error)) return res.status(409).json({ error: 'Ya existe otro paciente con ese documento.' });
    next(error);
  }
});

app.patch('/api/patients/:id/status', allowRoles('admin', 'nurse', 'doctor'), async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Identificador inválido.' });
    const careStatus = req.body.careStatus;
    if (!['Pendiente', 'Atendido'].includes(careStatus)) return res.status(400).json({ error: 'Estado de atención inválido.' });
    const updates = { careStatus, updatedAt: new Date() };
    if (req.session.user.role === 'doctor' && careStatus === 'Atendido') {
      updates.attendedBy = actorSnapshot(req.session.user);
      updates.doctor = req.session.user.fullName;
    }
    const result = await patientsCollection.findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: updates },
      { returnDocument: 'after' }
    );
    if (!result) return res.status(404).json({ error: 'No se encontró el paciente.' });
    res.json(publicPatient(result));
  } catch (error) { next(error); }
});

app.delete('/api/patients/:id', allowRoles('admin', 'nurse'), async (req, res, next) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Identificador inválido.' });
    const result = await patientsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    if (!result.deletedCount) return res.status(404).json({ error: 'No se encontró el paciente.' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.post('/api/patients/import', allowRoles('admin', 'nurse'), async (req, res, next) => {
  try {
    if (!Array.isArray(req.body.patients)) return res.status(400).json({ error: 'Se esperaba una lista de pacientes.' });
    const unique = new Map();
    let invalid = 0;
    for (const input of req.body.patients) {
      try {
        const patient = patientFromInput(input);
        patient.registeredBy = actorSnapshot(req.session.user);
        patient.attendedBy = null;
        const key = patient.document.toLocaleLowerCase('es');
        if (!unique.has(key)) unique.set(key, patient);
        else invalid += 1;
      } catch { invalid += 1; }
    }
    const incoming = [...unique.values()];
    const incomingDocuments = incoming.map((patient) => patient.documentKey);
    const existing = new Set((await patientsCollection.find({ documentKey: { $in: incomingDocuments } }, { projection: { documentKey: 1 } }).toArray()).map((doc) => doc.documentKey));
    const now = new Date();
    const toInsert = incoming.filter((patient) => !existing.has(patient.documentKey))
      .map((patient) => ({ ...patient, createdAt: now, updatedAt: now }));
    if (toInsert.length) await patientsCollection.insertMany(toInsert, { ordered: false });
    res.json({ inserted: toInsert.length, skipped: invalid + incoming.length - toInsert.length });
  } catch (error) { next(error); }
});

app.delete('/api/patients', allowRoles('admin'), async (req, res, next) => {
  try {
    const result = await patientsCollection.deleteMany({});
    res.json({ deleted: result.deletedCount });
  } catch (error) { next(error); }
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Error interno del servidor.' });
});

async function start() {
  await client.connect();
  const database = client.db(databaseName);
  patientsCollection = database.collection('patients');
  usersCollection = database.collection('users');
  rolesCollection = database.collection('roles');
  await patientsCollection.createIndex({ documentKey: 1 }, { unique: true, name: 'unique_patient_document' });
  await usersCollection.createIndex({ usernameKey: 1 }, { unique: true, name: 'unique_username' });
  await rolesCollection.createIndex({ code: 1 }, { unique: true, name: 'unique_role_code' });
  for (const role of roleDefinitions) {
    await rolesCollection.updateOne({ code: role.code }, { $setOnInsert: { ...role, createdAt: new Date() } }, { upsert: true });
  }
  for (const seed of initialUsers) {
    const usernameKey = normalized(seed.username);
    const found = await usersCollection.findOne({ usernameKey });
    if (!found) {
      await usersCollection.insertOne({
        fullName: seed.fullName, username: seed.username, usernameKey,
        passwordHash: await bcrypt.hash(seed.password, 10), role: seed.role,
        isActive: true, createdAt: new Date(), createdBy: { system: 'seed-demo' },
        ...(seed.patientDocument ? { patientDocument: seed.patientDocument, patientDocumentKey: normalized(seed.patientDocument) } : {})
      });
    }
  }
  const demoPatient = await patientsCollection.findOne({ documentKey: 'demo-101' });
  if (!demoPatient) {
    await patientsCollection.insertOne({
      name: 'Paciente Demo A',
      document: 'DEMO-101',
      documentKey: 'demo-101',
      age: 64,
      gender: 'Mujer',
      condition: 'Dolor precordial moderado',
      description: 'Paciente de demostración para visualización de turno personal en triaje',
      priority: 2,
      bloodPressure: '120/80',
      pulse: '82',
      respiratoryRate: '18',
      temperature: '36.8',
      oxygen: '98',
      careStatus: 'Pendiente',
      doctor: 'Por asignar',
      registeredBy: { name: 'Enfermería de demostración', role: 'nurse' },
      attendedBy: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
  app.listen(port, '0.0.0.0', () => {
    console.log(`trIAje listo en http://localhost:${port} (y accesible en red local por 0.0.0.0:${port})`);
    console.log(`MongoDB conectado: ${databaseName} (patients, users, roles)`);
  });
}

start().catch((error) => {
  console.error('No se pudo conectar a MongoDB. Revisa que el servicio MongoDB esté iniciado.', error.message);
  process.exit(1);
});
