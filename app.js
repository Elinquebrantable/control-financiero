'use strict';

/************************************************************
 * CONTROL FINANCIERO FAMILIAR
 * Los datos viven solo en este teléfono (localStorage; las
 * fotos de facturas en IndexedDB).
 * Cálculos trasladados de Code.gs (DESAFÍO FINANCIERO 90D).
 ************************************************************/

/* Al publicar un cambio: subir este número y el de version.json (deben ser iguales) */
const VERSION = '0.17.0';
const BETA = true; /* quitar en el lanzamiento oficial */

const CLAVE = 'cff.v1';
const DIAS_PROGRAMA = 90;
const SEMANAS = 13;

const CAT_GASTO = {
  'Comida': '🛒', 'Restaurantes': '🍽️', 'Vivienda': '🏠', 'Electricidad': '⚡', 'Agua': '💧',
  'Servicios': '🔥', 'Internet y teléfono': '📱', 'Transporte': '🚗', 'Gasolina': '⛽', 'Seguros': '🛡️',
  'Salud': '🩺', 'Cuidado personal': '💇', 'Hijos': '🧒', 'Educación': '🎓', 'Viajes': '✈️', 'Mascotas': '🐾',
  'Diversión': '🎉', 'Ropa': '👕', 'Suscripciones': '📺', 'Donaciones': '🙏', 'Otros': '📦'
};
/* Nombre que se muestra (la clave se guarda igual para no romper datos viejos) */
const NOMBRE_CAT = {
  'Comida': 'Comida y súper', 'Vivienda': 'Vivienda (renta o hipoteca)', 'Servicios': 'Gas y otros servicios',
  'Transporte': 'Carro y transporte', 'Donaciones': 'Donaciones y diezmo'
};
const nombreCat = c => NOMBRE_CAT[c] || c;
/* Forma de pago de cada gasto */
const FORMAS_PAGO = { credito: '💳 Tarjeta de crédito', debito: '🏦 Débito / transferencia', efectivo: '💵 Efectivo' };
const CAT_INGRESO = {
  'Salario': '💼', 'Negocio': '🏪', 'Renta': '🏘️', 'Inversiones': '📈',
  'Pasivo': '🌱', 'Extra': '✨', 'Otros': '💵'
};
/* Ingresos que llegan sin trabajar activamente por ellos */
const CAT_PASIVO = ['Renta', 'Inversiones', 'Pasivo'];
const TIPO_CUENTA = { 'Efectivo': '💵', 'Banco': '🏦', 'Ahorros': '🐖', 'Negocio': '🏪', 'Otra': '📁' };
const EMOCIONES = ['Ansiedad', 'Miedo', 'Culpa', 'Vergüenza', 'Presión', 'Desconexión', 'Deseo', 'Ambición', 'Crecimiento', 'Esperanza', 'Otra'];


/************************************************************
 * AYUDAS
 ************************************************************/

const $ = s => document.querySelector(s);

const esc = t => String(t ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const iso = d =>
  d.getFullYear() + '-' +
  String(d.getMonth() + 1).padStart(2, '0') + '-' +
  String(d.getDate()).padStart(2, '0');

const hoy = () => iso(new Date());
const mesActual = () => hoy().slice(0, 7);

const aFecha = s => {
  const [a, m, d] = String(s).split('-').map(Number);
  return new Date(a, m - 1, d);
};

const sumarDias = (s, n) => {
  const d = aFecha(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};

const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 86400000);

const r2 = n => Math.round(n * 100) / 100;

function num(v) {
  let t = String(v ?? '').replace(/[^\d.,-]/g, '');
  // "3,000" y "1,234.50" son miles; "12,5" es decimal
  if (t.includes('.') || /,\d{3}(,|$)/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  const n = parseFloat(t);
  return isFinite(n) ? n : 0;
}

/* Protección: aunque escriban el número completo, solo se guardan los últimos 4 */
const soloUltimos4 = t => String(t ?? '').replace(/\D/g, '').slice(-4);

function dinero(n) {
  const v = r2(Number(n) || 0);
  const txt = Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2
  });
  return (v < 0 ? '-' : '') + S.perfil.moneda + txt;
}

const fechaCorta = s =>
  aFecha(s).toLocaleDateString('es', { day: 'numeric', month: 'short' });

const nombreMes = m => {
  const d = aFecha(m + '-01');
  const mes = d.toLocaleDateString('es', { month: 'long' });
  return mes.charAt(0).toUpperCase() + mes.slice(1) + ' ' + d.getFullYear();
};

const suma = (lista, f) => lista.reduce((t, x) => t + (Number(f(x)) || 0), 0);

const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, a / b * 100)) : 0;


/************************************************************
 * DATOS
 ************************************************************/

const nuevoEstado = () => ({
  v: 1,
  perfil: {
    nombre: '', moneda: '$', inicio: '', metodo: '', extra: 0, sinDeudas: false,
    instalarLuego: '', ultimoRespaldo: '', ultimaCuenta: '', correo: '', saludoDia: '', tema: 'oscuro',
    negocio: '', vista: 'todo', extraPersonal: 0, extraNegocio: 0
  },
  mov: [],      // {id, tipo:'gasto'|'ingreso', monto, cat, nota, fecha, fuga, cuenta, fijoId, foto, ambito}
  deudas: [],   // {id, nombre, ultimos4, tipo, saldo, saldoInicial, apr, minimo, limite, dia, ambito, deNegocio}
  pagos: [],    // {id, deudaId, nombre, monto, fecha, cuenta}
  metas: [],    // {id, nombre, meta, actual}
  aportes: [],  // {id, metaId, nombre, monto, fecha}
  cuentas: [],  // {id, nombre, tipo, ultimos4, saldo, ambito, actualizada, historial:[{fecha, saldo}]}
  fijos: [],    // {id, tipo:'gasto'|'ingreso', nombre, monto, cat, dia, cuenta, ambito}
  pyg: [],      // P&L del negocio: {id, mes:'AAAA-MM', meses, ingresos, gastos, nota}
  presupuesto: {}, // gasto mensual planeado de la casa por categoría: {Comida: 600, …}
  checkins: {}, // {semana: {freno, corrijo, fecha}}
  retos: {},    // {n: 'fecha en que se cumplió'}
  radio: null,  // {emocion, preocupa, identidad, fecha}
  historial: {}, // foto de totales por mes: {'AAAA-MM': {deuda, cuentas, ahorro…}}
  ciclo: null,   // ciclo de 90 días en curso: {n, inicio, base, cortes}
  ciclos: [],    // resúmenes de ciclos terminados
  retosMes: {},  // retos del mes logrados: {n: fecha}
  catsPropias: {}, // categorías de gasto agregadas por la persona: {nombre: emoji}
  reglas: [],      // reglas aprendidas al importar: {texto, cat, ambito}
  eventos: [],     // eventos del negocio: {id, nombre, fecha, presupuesto, meta, cerrado}
  reembolsos: []   // movimientos negocio ↔ casa: {id, tipo:'reembolso'|'prestamo', monto, fecha, nota}
});

function leer() {
  const base = nuevoEstado();
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (g && typeof g === 'object') {
      Object.assign(base, g);
      base.perfil = Object.assign(nuevoEstado().perfil, g.perfil || {});
    }
  } catch (e) { /* si no se puede leer, se empieza en limpio */ }
  return base;
}

function guardar() {
  try { registrarFoto(); } catch (e) { /* la foto del mes nunca impide guardar */ }
  try {
    localStorage.setItem(CLAVE, JSON.stringify(S));
  } catch (e) {
    aviso('No se pudo guardar en este teléfono');
  }
}

let S = leer();
let vistaActual = 'inicio';
let mesVer = mesActual();


/************************************************************
 * FOTOS DE FACTURAS (IndexedDB, solo en el teléfono)
 ************************************************************/

let bd;

function abrirBD() {
  if (!bd) {
    bd = new Promise((ok, err) => {
      const r = indexedDB.open('cff', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('fotos');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => err(r.error);
    });
  }
  return bd;
}

function fotoOp(modo, f) {
  return abrirBD().then(db => new Promise((ok, err) => {
    const t = db.transaction('fotos', modo);
    const q = f(t.objectStore('fotos'));
    t.oncomplete = () => ok(q && q.result);
    t.onerror = () => err(t.error);
  }));
}

const fotoGuardar = (id, datos) => fotoOp('readwrite', s => s.put(datos, id));
const fotoLeer = id => fotoOp('readonly', s => s.get(id));
const fotoBorrar = id => fotoOp('readwrite', s => s.delete(id)).catch(() => {});
const fotosBorrarTodas = () => fotoOp('readwrite', s => s.clear()).catch(() => {});

async function fotosTodas() {
  const fotos = {};
  for (const m of S.mov.filter(x => x.foto)) {
    try {
      const f = await fotoLeer(m.id);
      if (f) fotos[m.id] = f;
    } catch (e) { /* una foto ilegible no detiene el respaldo */ }
  }
  return fotos;
}

function comprimir(archivo) {
  return new Promise((ok, err) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = err;
    img.src = url;
  });
}

/* Lectura del total en el propio teléfono: la foto no se envía a ningún lado */
function cargarLector() {
  if (window.Tesseract) return Promise.resolve();
  return new Promise((ok, err) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload = ok;
    s.onerror = err;
    document.head.appendChild(s);
  });
}

function totalDeTexto(texto) {
  const montos = l =>
    (l.match(/\d{1,3}(?:,\d{3})+\.\d{2}(?!\d)|\d+[.,]\d{2}(?!\d)/g) || [])
      .map(num)
      .filter(n => n > 0 && n < 100000);
  const lineas = String(texto).split('\n');
  const conTotal = lineas.filter(l =>
    /total|importe|amount due|balance due/i.test(l) && !/sub\s*-?\s*total/i.test(l));
  let candidatos = conTotal.flatMap(montos);
  if (!candidatos.length) candidatos = lineas.flatMap(montos);
  return candidatos.length ? Math.max(...candidatos) : 0;
}

async function leerTotal(datos) {
  await cargarLector();
  const r = await window.Tesseract.recognize(datos, 'eng');
  return totalDeTexto(r.data.text);
}


/************************************************************
 * LECTURA DE DOCUMENTOS (estados de cuenta y P&L)
 * Todo se lee en el propio teléfono: el archivo no se envía a
 * ningún lado y tampoco se guarda; solo se guardan los números
 * que la persona confirma.
 ************************************************************/

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/';

function cargarPDF() {
  if (window.pdfjsLib) return Promise.resolve();
  return new Promise((ok, err) => {
    const s = document.createElement('script');
    s.src = PDFJS + 'pdf.min.js';
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
      ok();
    };
    s.onerror = err;
    document.head.appendChild(s);
  });
}

/* Devuelve el texto del archivo, una línea por renglón */
async function textoDeArchivo(archivo) {
  const esPDF = /pdf/i.test(archivo.type) || /\.pdf$/i.test(archivo.name);
  if (!esPDF) {
    await cargarLector();
    const r = await window.Tesseract.recognize(await comprimir(archivo), 'eng');
    return r.data.text;
  }
  await cargarPDF();
  const pdf = await window.pdfjsLib.getDocument({ data: await archivo.arrayBuffer() }).promise;
  const lineas = [];
  for (let p = 1; p <= Math.min(pdf.numPages, 10); p++) {
    const contenido = await (await pdf.getPage(p)).getTextContent();
    const filas = [];
    contenido.items.forEach(it => {
      if (!it.str || !it.str.trim()) return;
      const y = it.transform[5];
      let f = filas.find(z => Math.abs(z.y - y) <= 2.5);
      if (!f) filas.push(f = { y, items: [] });
      f.items.push({ x: it.transform[4], s: it.str });
    });
    filas.sort((a, b) => b.y - a.y)
      .forEach(f => lineas.push(f.items.sort((a, b) => a.x - b.x).map(i => i.s).join(' ')));
  }
  return lineas.join('\n');
}

/* Montos de una línea; "(1,234.56)" y "-1,234.56" cuentan como negativos */
function montosDe(linea) {
  return (String(linea).match(/\(?-?\s?\$?\s?\d{1,3}(?:,\d{3})+(?:\.\d{2})?\)?|\(?-?\s?\$?\s?\d+\.\d{2}\)?/g) || [])
    .map(t => (/^\(|^-/.test(t.trim()) ? -1 : 1) * Math.abs(num(t)));
}

/* Busca el monto que acompaña a la primera etiqueta que aparezca */
function buscarMonto(texto, patrones) {
  const lineas = String(texto).split('\n');
  for (const p of patrones) {
    for (let i = 0; i < lineas.length; i++) {
      if (!p.test(lineas[i])) continue;
      /* el monto más cercano después de la etiqueta (en PDFs de dos columnas hay otros montos en la misma línea) */
      const enLinea = montosDe(lineas[i].split(p).pop());
      if (enLinea.length) return enLinea[0];
      const siguiente = montosDe(lineas[i + 1] || '');
      if (siguiente.length) return siguiente[0];
    }
  }
  return null;
}

const MESES_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const numeroMes = t => {
  const k = String(t).toLowerCase().slice(0, 3);
  const i = MESES_EN.indexOf(k);
  return i >= 0 ? i + 1 : MESES_ES.indexOf(k) + 1;
};

/* Todas las fechas del texto (mm/dd/aaaa, "October 31, 2026", "31 de octubre de 2026") */
function fechasDe(texto) {
  const lista = [];
  const t = String(texto);
  const agregar = (a, m, d) => {
    a = Number(a); if (a < 100) a += 2000;
    m = Number(m); d = Number(d);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && a > 2000 && a < 2100) lista.push(iso(new Date(a, m - 1, d)));
  };
  for (const x of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)) agregar(x[3], x[1], x[2]);
  for (const x of t.matchAll(/\b([A-Za-zé]{3,10})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) if (numeroMes(x[1])) agregar(x[3], numeroMes(x[1]), x[2]);
  for (const x of t.matchAll(/\b(\d{1,2})\s+de\s+([a-zé]{3,10})\s+(?:de\s+)?(\d{4})\b/gi)) if (numeroMes(x[2])) agregar(x[3], numeroMes(x[2]), x[1]);
  return lista;
}

/* Fecha de corte probable: la más reciente que no sea futura */
const fechaDeCorte = texto => fechasDe(texto).filter(f => f <= hoy()).sort().pop() || '';

/* Primer "Mes Año" que aparezca (ej. "October 2026", "Octubre 2026") */
function mesDe(texto) {
  const x = String(texto).match(/\b([A-Za-zé]{3,10})\.?,?\s+(?:de\s+)?(\d{4})\b/g) || [];
  for (const t of x) {
    const [, m, a] = t.match(/([A-Za-zé]{3,10})\.?,?\s+(?:de\s+)?(\d{4})/);
    if (numeroMes(m) && Number(a) > 2000) return a + '-' + String(numeroMes(m)).padStart(2, '0');
  }
  const f = fechaDeCorte(texto);
  return f ? f.slice(0, 7) : '';
}

const PATRONES_SALDO = [
  /ending (daily )?balance|closing balance|statement ending balance/i,
  /saldo (final|al cierre|de cierre)|balance final/i,
  /available balance|saldo disponible/i,
  /current balance|saldo actual|new balance|nuevo saldo/i
];

const PATRONES_PYG = {
  ingresos: [/total (income|revenue|sales)|gross revenue|ingresos totales|total de ingresos|total ventas/i],
  gastos: [/total expenses|gastos totales|total de gastos/i],
  utilidad: [/net (income|profit|earnings)(?! *(from|before))(?!.*operating)|utilidad neta|ganancia neta|p[ée]rdida neta/i, /net operating income/i]
};

/* Lectura de un archivo dentro de un formulario: pone los números y avisa qué encontró */
function botonLeerArchivo(form, { acepta, alLeer }) {
  const zona = $('#zonaArchivo');
  zona.innerHTML = `
    <button type="button" class="btn ancho" id="btnArchivo">📄 Subir PDF o foto del documento</button>
    <input type="file" id="inputArchivo" accept="${acepta}" hidden>
    <p class="ayuda" id="estadoArchivo">Se lee aquí mismo en tu teléfono: el archivo no se envía ni se guarda. Revisa siempre los números antes de guardar.</p>`;
  $('#btnArchivo').addEventListener('click', () => $('#inputArchivo').click());
  $('#inputArchivo').addEventListener('change', async e => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const b = $('#btnArchivo');
    b.disabled = true;
    b.textContent = 'Leyendo ' + archivo.name + '…';
    try {
      const texto = await textoDeArchivo(archivo);
      $('#estadoArchivo').innerHTML = alLeer(texto, form, archivo);
    } catch (err) {
      $('#estadoArchivo').textContent = 'No pude leer ese archivo (¿sin señal o PDF protegido?). Escribe los números a mano.';
    }
    if (b.isConnected) { b.disabled = false; b.textContent = '📄 Subir otro documento'; }
  });
}


/************************************************************
 * CÁLCULOS
 ************************************************************/

/* PERSONAL Y NEGOCIO
 * Cada deuda, cuenta, fijo y movimiento puede ser "personal" (por defecto) o "negocio".
 * La vista elegida (Personal | Negocio | Todo) filtra totales, plan de salida y pagos. */

const AMBITOS = { personal: '🏠 Personal', negocio: '🏢 Negocio' };
const ambitoDe = x => (x && x.ambito === 'negocio') ? 'negocio' : 'personal';
const nombreNegocio = () => S.perfil.negocio || 'Negocio';

const conNegocio = () => !!S.perfil.negocio ||
  [S.deudas, S.cuentas, S.fijos, S.mov].some(l => l.some(x => x.ambito === 'negocio'));

const vistaElegida = () => conNegocio() ? (S.perfil.vista || 'todo') : 'todo';
const enVista = x => vistaElegida() === 'todo' || ambitoDe(x) === vistaElegida();

const deudaDePago = p => S.deudas.find(d => d.id === p.deudaId);
const pagoEnVista = p => enVista(deudaDePago(p) || {});

const deudasV = () => S.deudas.filter(enVista);
const cuentasV = () => S.cuentas.filter(enVista);
const fijosV = () => S.fijos.filter(enVista);

/* El extra del plan de salida se guarda por vista */
const claveExtra = () => ({ todo: 'extra', personal: 'extraPersonal', negocio: 'extraNegocio' })[vistaElegida()];

function campoAmbito() {
  if (!conNegocio()) return [];
  return [{
    n: 'ambito', t: 'select', l: '¿Es personal o del negocio?',
    ops: [['personal', AMBITOS.personal], ['negocio', '🏢 ' + nombreNegocio()]]
  }];
}

const ambitoPorDefecto = () => vistaElegida() === 'negocio' ? 'negocio' : 'personal';

function delMes(m) {
  const lista = [];
  S.mov.filter(x => x.fecha.startsWith(m) && enVista(x)).forEach(x => lista.push({ k: 'mov', ...x }));
  S.pagos.filter(x => x.fecha.startsWith(m) && pagoEnVista(x)).forEach(x => lista.push({ k: 'pago', ...x }));
  if (vistaElegida() !== 'negocio') {
    S.aportes.filter(x => x.fecha.startsWith(m)).forEach(x => lista.push({ k: 'aporte', ...x }));
  }
  lista.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
  return lista;
}

function totales(lista) {
  const ingresos = suma(lista.filter(x => x.k === 'mov' && x.tipo === 'ingreso'), x => x.monto);
  const gastos = suma(lista.filter(x => x.k === 'mov' && x.tipo === 'gasto'), x => x.monto);
  const pagos = suma(lista.filter(x => x.k === 'pago'), x => x.monto);
  const aportes = suma(lista.filter(x => x.k === 'aporte'), x => x.monto);
  return { lista, ingresos, gastos, pagos, aportes, queda: r2(ingresos - gastos - pagos - aportes) };
}

const resumen = m => totales(delMes(m));

const deudaTotal = () => suma(deudasV(), d => d.saldo);
const deudaInicial = () => suma(deudasV(), d => d.saldoInicial);
const ahorroTotal = () => suma(S.metas, m => m.actual);
const dineroEnCuentas = () => suma(cuentasV(), c => c.saldo);

const utilizacion = d => d.limite > 0 ? r2(d.saldo / d.limite * 100) : 0;

/* Promociones (ej. 0%): el error más caro es que terminen sin un plan */
const promoActiva = d => !!d.promoFin && d.promoFin >= hoy() && d.saldo > 0;
const diasPromo = d => diasEntre(hoy(), d.promoFin);
const promosPorVencer = (dias = 120) =>
  deudasV().filter(d => promoActiva(d) && diasPromo(d) <= dias).sort((a, b) => a.promoFin.localeCompare(b.promoFin));

function moverCuenta(id, delta) {
  const c = id && S.cuentas.find(x => x.id === id);
  if (c) c.saldo = r2(c.saldo + delta);
}

const signo = m => m.tipo === 'ingreso' ? 1 : -1;

const etiquetaCuenta = c => c.nombre + (c.ultimos4 ? ' ••' + c.ultimos4 : '');

function campoCuenta(texto) {
  if (!S.cuentas.length) return [];
  return [{
    n: 'cuenta', t: 'select', l: texto,
    ops: [...S.cuentas.map(c => [c.id, etiquetaCuenta(c) + ' · ' + dinero(c.saldo)]), ['', 'No tocar ninguna cuenta']]
  }];
}

const cuentaPorDefecto = () =>
  S.cuentas.some(c => c.id === S.perfil.ultimaCuenta) ? S.perfil.ultimaCuenta : (S.cuentas[0] ? S.cuentas[0].id : '');

const fijoHecho = f => S.mov.some(m => m.fijoId === f.id && m.fecha.startsWith(mesActual()));

function diasParaDia(dia) {
  dia = Number(dia);
  if (!dia) return null;
  const h = new Date();
  const d = h.getDate();
  if (dia >= d) return dia - d;
  const finMes = new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate();
  return finMes - d + dia;
}

function proximosPagos() {
  const hace20 = sumarDias(hoy(), -20);
  return deudasV()
    .filter(d => d.saldo > 0 && d.dia)
    .map(d => ({ ...d, faltan: diasParaDia(d.dia) }))
    .filter(d => d.faltan !== null && d.faltan <= 7)
    .filter(d => !S.pagos.some(p => p.deudaId === d.id && p.fecha >= hace20))
    .sort((a, b) => a.faltan - b.faltan);
}

/* Simulador de salida de deudas (igual que simulatePayoff_ del original) */
function simular(metodo, extra, lista = deudasV()) {
  const deudas = lista
    .filter(d => d.saldo > 0)
    .map(d => ({
      nombre: d.nombre, balance: d.saldo, apr: d.apr || 0, base: d.minimo || 0, mes: null,
      /* meses que le quedan a la promoción; después aplica aprDespues */
      finPromo: promoActiva(d) && d.aprDespues ? Math.max(0, Math.round(diasPromo(d) / 30.4)) : null,
      aprDespues: d.aprDespues || 0
    }));

  const presupuesto = suma(deudas, d => d.base) + (extra || 0);
  if (!deudas.length || presupuesto <= 0) return null;

  let interes = 0;
  let mes = 0;

  while (deudas.some(d => d.balance > 0.01) && mes < 600) {
    mes++;

    deudas.forEach(d => {
      if (d.balance <= 0) return;
      const apr = d.finPromo !== null && mes > d.finPromo ? d.aprDespues : d.apr;
      const i = d.balance * (apr / 100) / 12;
      d.balance += i;
      interes += i;
    });

    let resta = presupuesto;

    const pagar = (d, monto) => {
      d.balance -= monto;
      resta -= monto;
      if (d.balance <= 0.01 && !d.mes) { d.balance = 0; d.mes = mes; }
    };

    deudas.forEach(d => {
      if (d.balance > 0) pagar(d, Math.min(d.balance, d.base, resta));
    });

    deudas
      .filter(d => d.balance > 0.01)
      .sort((a, b) => {
        if (metodo === 'bola') return a.balance - b.balance;
        /* avalancha: si la promoción ya terminó (o termina en ≤3 meses), cuenta el interés que viene */
        const tasa = d => d.finPromo !== null && mes >= d.finPromo - 3 ? d.aprDespues : d.apr;
        return tasa(b) - tasa(a);
      })
      .forEach(d => { if (resta > 0) pagar(d, Math.min(d.balance, resta)); });
  }

  const pagado = deudas.every(d => d.balance <= 0.01);
  const fin = new Date();
  fin.setMonth(fin.getMonth() + mes);

  return {
    pagado,
    meses: pagado ? mes : null,
    fecha: pagado ? nombreMes(iso(fin).slice(0, 7)) : null,
    interes: r2(interes),
    presupuesto: r2(presupuesto),
    orden: deudas.slice().sort((a, b) => (a.mes || 999) - (b.mes || 999))
  };
}


/************************************************************
 * RETOS SEMANALES — Despertar → Ordenar → Ejecutar → Sostener
 ************************************************************/

function programa() {
  const inicio = S.perfil.inicio || hoy();
  const pasados = Math.max(0, diasEntre(inicio, hoy()));
  return {
    dia: Math.min(DIAS_PROGRAMA, pasados + 1),
    semana: Math.min(SEMANAS, Math.floor(pasados / 7) + 1),
    terminado: pasados >= DIAS_PROGRAMA
  };
}

function rangoSemana(n) {
  const desde = sumarDias(S.perfil.inicio || hoy(), (n - 1) * 7);
  return [desde, sumarDias(desde, 6)];
}

const enRango = (x, r) => x.fecha >= r[0] && x.fecha <= r[1];

function deLaSemana(n) {
  const r = rangoSemana(n);
  const lista = [];
  S.mov.filter(x => enRango(x, r)).forEach(x => lista.push({ k: 'mov', ...x }));
  S.pagos.filter(x => enRango(x, r)).forEach(x => lista.push({ k: 'pago', ...x }));
  S.aportes.filter(x => enRango(x, r)).forEach(x => lista.push({ k: 'aporte', ...x }));
  return totales(lista);
}

const RETOS = [
  {
    n: 1, etapa: 'DESPERTAR', titulo: 'Tu radiografía',
    texto: 'Responde con honestidad cómo te sientes hoy con tu dinero y escribe quién decides ser.',
    accion: ['Hacer mi radiografía', () => formRadiografia()],
    auto: () => [S.radio ? 1 : 0, 1]
  },
  {
    n: 2, etapa: 'DESPERTAR', titulo: '7 días mirando tu dinero',
    texto: 'Anota lo que gastas y lo que entra, sin juzgarte. Meta: registrar algo al menos 5 de los 7 días.',
    accion: ['Registrar un movimiento', () => abrirRegistrar()],
    auto: r => {
      const dias = new Set([...S.mov, ...S.pagos, ...S.aportes].filter(x => enRango(x, r)).map(x => x.fecha));
      return [dias.size, 5];
    }
  },
  {
    n: 3, etapa: 'ORDENAR', titulo: 'Todo lo que entra',
    texto: 'Registra cada ingreso de este mes: salario, negocio y extras. Sin saber cuánto entra no hay plan.',
    accion: ['Registrar un ingreso', () => formMov('ingreso')],
    auto: () => [S.mov.filter(x => x.tipo === 'ingreso').length, 1]
  },
  {
    n: 4, etapa: 'ORDENAR', titulo: 'Todas tus deudas sobre la mesa',
    texto: 'Agrega cada tarjeta y préstamo con su saldo, interés y pago mínimo. Lo que no se mira no se resuelve.',
    accion: ['Ir a Deudas', () => ir('deudas')],
    auto: () => [S.perfil.sinDeudas ? 1 : Math.min(1, S.deudas.length), 1]
  },
  {
    n: 5, etapa: 'ORDENAR', titulo: 'Caza de fugas',
    texto: 'Encuentra 3 gastos que no necesitas (suscripciones, antojos, comisiones) y márcalos como “fuga” al registrarlos.',
    accion: ['Registrar un gasto', () => formMov('gasto')],
    auto: () => [S.mov.filter(x => x.fuga).length, 3]
  },
  {
    n: 6, etapa: 'ORDENAR', titulo: 'Tu primer fondo',
    texto: 'Crea una meta de ahorro y haz tu primer aporte, aunque sea pequeño. Lo importante es empezar.',
    accion: ['Ir a Ahorros', () => ir('ahorros')],
    auto: () => [Math.min(1, S.aportes.length), 1]
  },
  {
    n: 7, etapa: 'EJECUTAR', titulo: 'Elige tu método',
    texto: 'Abre el plan de salida en Deudas, compara avalancha y bola de nieve, y elige con cuál vas a pagar.',
    accion: ['Ver mi plan de salida', () => ir('deudas')],
    auto: () => [S.perfil.sinDeudas || S.perfil.metodo ? 1 : 0, 1]
  },
  {
    n: 8, etapa: 'EJECUTAR', titulo: 'Un pago extra',
    texto: 'Esta semana haz un pago a tu deuda prioritaria por encima del mínimo y regístralo aquí.',
    accion: ['Registrar un pago', () => elegirDeudaParaPago()],
    auto: r => [S.perfil.sinDeudas ? 1 : Math.min(1, S.pagos.filter(x => enRango(x, r)).length), 1]
  },
  {
    n: 9, etapa: 'EJECUTAR', titulo: 'Semana sin fugas',
    texto: 'Siete días sin repetir los gastos que marcaste como fuga. Lo que no se va, se queda contigo.'
  },
  {
    n: 10, etapa: 'EJECUTAR', titulo: 'Sube tu ahorro',
    texto: 'Haz dos aportes a tu meta en esta misma semana. Dos pequeños valen más que uno que nunca llega.',
    accion: ['Ir a Ahorros', () => ir('ahorros')],
    auto: r => [S.aportes.filter(x => enRango(x, r)).length, 2]
  },
  {
    n: 11, etapa: 'SOSTENER', titulo: 'Revisión en familia',
    texto: 'Siéntate 20 minutos con tu pareja o tu familia y revisen juntos los números de esta app.'
  },
  {
    n: 12, etapa: 'SOSTENER', titulo: 'Ponlo en automático',
    texto: 'Programa en tu banco la transferencia a tu ahorro y los pagos mínimos, para no depender de la memoria.'
  },
  {
    n: 13, etapa: 'SOSTENER', titulo: 'Tu foto del día 90',
    texto: 'Compara dónde empezaste con dónde estás hoy y escribe tu siguiente objetivo.'
  }
];


/************************************************************
 * NAVEGACIÓN
 ************************************************************/

const TITULOS = { inicio: 'Inicio', ingresos: 'Ingresos', deudas: 'Deudas', ahorros: 'Ahorros', retos: 'Progreso' };
const VISTAS = { inicio: vistaInicio, ingresos: vistaIngresos, deudas: vistaDeudas, ahorros: vistaAhorros, retos: vistaProgreso };

function ir(v) {
  vistaActual = v;
  window.scrollTo(0, 0);
  pintar();
}

/* Saludo según la hora, como en la app del banco */
function saludo() {
  const h = new Date().getHours();
  return h >= 5 && h < 12 ? 'Buenos días' : h >= 12 && h < 19 ? 'Buenas tardes' : 'Buenas noches';
}
const primerNombre = () => String(S.perfil.nombre || '').trim().split(/\s+/)[0];
const correoValido = c => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(c || '').trim());

function pintar() {
  reconstruirCats();
  const p = programa();
  $('#titulo').textContent = TITULOS[vistaActual];
  $('#hola').innerHTML =
    `<b>${esc(saludo())}${primerNombre() ? ', ' + esc(primerNombre()) : ''}</b> <span class="dia">` +
    (p.terminado ? '90 días cumplidos' : 'Día ' + p.dia + ' de ' + DIAS_PROGRAMA) + '</span>';
  document.querySelectorAll('#tabs [data-ir]').forEach(b =>
    b.classList.toggle('activo', b.dataset.ir === vistaActual));
  $('#vista').innerHTML = VISTAS[vistaActual]();
}

let relojAviso;
function aviso(texto) {
  const a = $('#aviso');
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(relojAviso);
  relojAviso = setTimeout(() => { a.hidden = true; }, 2600);
}

/* Las acciones de pantalla se enlazan con data-a="nombre" y data-id */
const ACC = {};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (b && ACC[b.dataset.a]) {
    ACC[b.dataset.a](b.dataset.id, b);
    return;
  }
  const t = e.target.closest('#tabs [data-ir]');
  if (t) ir(t.dataset.ir);
});

$('#btnMas').addEventListener('click', () => abrirRegistrar());
$('#btnAjustes').addEventListener('click', () => abrirAjustes());
$('#fondo').addEventListener('click', e => {
  if (e.target.id === 'fondo' && S.perfil.inicio) cerrarHoja();
});


/************************************************************
 * VISTA: INICIO
 ************************************************************/

function vistaInicio() {
  const r = resumen(mesVer);
  const esteMes = mesVer === mesActual();
  const p = programa();
  const reto = RETOS[p.semana - 1];
  const altas = deudasV().filter(d => utilizacion(d) >= 50);

  let color = 'green';
  let mensaje = 'Vas en positivo este mes. Decide a dónde va lo que te queda.';
  if (!r.ingresos && !r.gastos) {
    color = 'blue';
    mensaje = 'Toca el botón + para registrar tu primer ingreso o gasto.';
  } else if (r.queda < 0) {
    color = 'red';
    mensaje = 'Este mes ha salido más de lo que ha entrado.';
  } else if (!r.ingresos) {
    color = 'blue';
    mensaje = 'Registra tus ingresos para saber cuánto te queda de verdad.';
  } else if (altas.length) {
    color = 'yellow';
    mensaje = 'Vas en positivo, pero ' + altas[0].nombre + ' está usada al ' + Math.round(utilizacion(altas[0])) + '%.';
  }

  let h = tarjetaActualizar() + tarjetaInstalar() + tarjetaRespaldo() + selectorVista() + tarjetaMensajeDia();

  h += tarjetaConfigurar();

  /* Disponible para gastar (siempre el mes en curso) */
  h += `<div class="seccion"><h2>Disponible para gastar</h2>
    <button class="icono" data-a="ir" data-id="ingresos" aria-label="Ver ingresos"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h18l-7 8v6l-4 2v-8z"/></svg></button>
  </div>` + tarjetaDisponible();

  if (vistaElegida() !== 'negocio') h += tarjetaSalud();

  const promos = esteMes ? promosPorVencer(120) : [];
  if (promos.length) {
    h += `<div class="card semaforo ${diasPromo(promos[0]) <= 60 ? 'red' : 'yellow'}">
      <h2>⏳ Promociones por terminar</h2>
      <ul class="consejos">${promos.map(d => `<li><b>${esc(d.nombre)}</b>: ${dinero(d.saldo)} al ${d.apr || 0}% hasta el ${esc(fechaCorta(d.promoFin))} (faltan ${diasPromo(d)} días).
        ${d.aprDespues ? 'Después: ' + d.aprDespues + '%, ≈ <b>' + dinero(r2(d.saldo * d.aprDespues / 1200)) + ' al mes</b> de interés.' : 'Anota el interés que tendrá después.'}
        No le cargues nada nuevo y define cómo la vas a pagar antes de esa fecha.</li>`).join('')}</ul>
    </div>`;
  }

  h += tarjetaFinCiclo();

  if (S.deudas.length || S.cuentas.length || S.mov.length) h += `<div class="seccion"><h2>Mis indicadores</h2><button class="icono" data-a="verRetos" aria-label="Ver progreso"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg></button></div>` + tarjetaIndicadores(4);

  h += seccionProximo();

  /* Resumen del mes elegido */
  h += `<div class="seccion"><h2>Este mes</h2>
      <div class="mes">
        <button data-a="mes" data-id="-1" aria-label="Mes anterior">‹</button>
        <b>${esc(nombreMes(mesVer))}</b>
        <button data-a="mes" data-id="1" aria-label="Mes siguiente" ${esteMes ? 'disabled' : ''}>›</button>
      </div>
    </div>
  <div class="card semaforo ${color}">
    <span class="muted chico">Te queda${conNegocio() && vistaElegida() !== 'todo' ? ' · ' + esc(etiquetaVista()) : ''}</span>
    <p class="grande ${r.queda < 0 ? 'rojo' : ''}">${dinero(r.queda)}</p>
    <p class="chico muted" style="margin:0">${esc(mensaje)}</p>
    <div class="cuatro">
      <div class="dato"><span>Ingresos</span><b class="verde">${dinero(r.ingresos)}</b></div>
      <div class="dato"><span>Gastos</span><b>${dinero(r.gastos)}</b></div>
      <div class="dato"><span>Pagado a deudas</span><b>${dinero(r.pagos)}</b></div>
      <div class="dato"><span>Ahorrado</span><b>${dinero(r.aportes)}</b></div>
    </div>
  </div>`;

  if (esteMes && vistaElegida() === 'todo') h += tarjetaPanorama();
  if (esteMes && conNegocio() && vistaElegida() !== 'personal') h += tarjetaNegocioCasa();

  if (!p.terminado) {
    const hecho = S.retos[reto.n];
    h += `
    <div class="card reto ${hecho ? 'hecho' : 'actual'}">
      <span class="num">Reto de la semana ${reto.n} · ${reto.etapa}</span>
      <h3>${hecho ? '✅ ' : ''}${esc(reto.titulo)}</h3>
      <p>${esc(reto.texto)}</p>
      <div class="botones"><button class="btn chico ${hecho ? '' : 'principal'}" data-a="verRetos">${hecho ? 'Ver todos los retos' : 'Ir al reto'}</button></div>
    </div>`;
    h += tarjetaRetoMes(RETOS_MES[mesDelCiclo() - 1], true);
  }

  if (esteMes) h += tarjetaFijos() + tarjetaDinero();

  if (vistaElegida() !== 'personal' && conNegocio()) h += tarjetaPyG() + tarjetaEventos();

  const gastos = r.lista.filter(x => x.k === 'mov' && x.tipo === 'gasto');
  if (vistaElegida() !== 'negocio') {
    h += tarjetaPresupuesto(r);
    h += tarjetaComparar(false);
  } else if (gastos.length) {
    const porCat = {};
    gastos.forEach(g => { porCat[g.cat] = (porCat[g.cat] || 0) + g.monto; });
    const orden = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
    const fugas = suma(gastos.filter(g => g.fuga), g => g.monto);
    h += `<div class="card"><h2>¿En qué se fue? ${fugas ? `<span class="etiqueta red">Fugas ${dinero(fugas)}</span>` : ''}</h2>` +
      orden.map(([c, m]) => `
        <div class="cat">
          <div class="fila"><span>${CAT_GASTO[c] || '📦'} ${esc(c)}</span><b>${dinero(m)}</b></div>
          <div class="barra azul"><i style="width:${pct(m, orden[0][1])}%"></i></div>
        </div>`).join('') +
      `</div>`;
  }

  h += `<div class="card"><h2>Movimientos <small>· ${esc(nombreMes(mesVer))}</small></h2>`;
  if (!r.lista.length) {
    h += `<div class="vacio"><span class="emo">🧾</span>Todavía no hay nada registrado este mes.</div>`;
  } else {
    h += `<ul class="lista">` + r.lista.map(filaMov).join('') + `</ul>`;
  }
  h += `</div>`;

  h += `<p class="legal">${BETA ? '<b>Versión beta gratis.</b> Puede tener errores: guarda tu copia seguido.<br>' : ''}Herramienta educativa. No es asesoría financiera, legal ni fiscal.<br>Tus datos financieros se guardan solo en este teléfono.</p>`;
  return h;
}

ACC.ir = id => { cerrarHoja(); ir(id); };

/* Próxima fecha en que entra un ingreso fijo */
function proximoIngreso() {
  const lista = fijosV().filter(f => f.tipo === 'ingreso' && f.dia && f.monto > 0)
    .map(f => ({ ...f, faltan: diasParaDia(f.dia) }))
    .sort((a, b) => a.faltan - b.faltan);
  return lista[0] || null;
}

/* Mínimos de deudas que todavía faltan por pagar este mes */
function minimosPendientes() {
  const dHoy = new Date().getDate();
  const hace20 = sumarDias(hoy(), -20);
  return suma(deudasV().filter(d => d.saldo > 0 && d.minimo > 0 && d.dia >= dHoy &&
    !S.pagos.some(p => p.deudaId === d.id && p.fecha >= hace20)), d => d.minimo);
}

function anillo(pctValor, centro, rojo) {
  const R = 54, C = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(1, pctValor)));
  return `<div class="anillo">
    <svg viewBox="0 0 128 128"><circle class="pista" cx="64" cy="64" r="${R}"/>
      <circle class="valor ${rojo ? 'rojo' : ''}" cx="64" cy="64" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg>
    <div class="centro">${centro}</div>
  </div>`;
}

function tarjetaDisponible() {
  const rA = resumen(mesActual());
  const hayCuentas = cuentasV().length > 0;
  const pendientes = fijosV().filter(f => !fijoHecho(f));
  const porEntrar = suma(pendientes.filter(f => f.tipo === 'ingreso'), f => f.monto);
  const porPagar = suma(pendientes.filter(f => f.tipo === 'gasto'), f => f.monto);
  const gastadoCasa = suma(rA.lista.filter(x => x.k === 'mov' && x.tipo === 'gasto' && ambitoDe(x) === 'personal'), x => x.monto);
  const casaRestante = vistaElegida() !== 'negocio' ? Math.max(0, presupuestoTotal() - gastadoCasa) : 0;

  const base = hayCuentas ? dineroEnCuentas() : rA.queda;
  const proyectado = base + porEntrar;
  const gasto = porPagar + minimosPendientes() + casaRestante;
  const restante = r2(proyectado - gasto);
  const ok = restante >= 0;

  const prox = proximoIngreso();
  const pastilla = prox
    ? `Antes del día de pago ${esc(fechaCorta(sumarDias(hoy(), prox.faltan)))}`
    : 'Agrega tus ingresos para proyectar';

  return `<div class="card hero">
    <div class="cuerpo">
      <div class="cifras">
        <div><span>${hayCuentas ? 'Balance actual' : 'Te queda este mes'}</span><b>${dinero(base)}</b></div>
        <div><span>Balance proyectado</span><b>${dinero(proyectado)}</b></div>
        <div><span>Gasto proyectado</span><b>${dinero(gasto)}</b></div>
      </div>
      ${anillo(proyectado > 0 ? restante / proyectado : 0,
        `<span class="ok ${ok ? '' : 'mal'}">${ok ? '✓' : '!'}</span><b class="${ok ? '' : 'rojo'}">${dinero(restante)}</b><small>Restante</small>`, !ok)}
    </div>
    <button class="pastilla" data-a="ir" data-id="ingresos">${pastilla}</button>
    ${!hayCuentas ? '<p class="ayuda centro" style="margin-top:10px">Sube el estado de cuenta de tus bancos para ver tu balance real.</p>' : ''}
  </div>`;
}

function seccionProximo() {
  const deudas = proximosPagos().map(d => ({
    id: d.id, tipo: 'deuda', nombre: d.nombre, monto: d.minimo, faltan: d.faltan
  }));
  const fijos = fijosV().filter(f => f.tipo === 'gasto' && !fijoHecho(f) && f.dia)
    .map(f => ({ id: f.id, tipo: 'fijo', nombre: f.nombre, monto: f.monto, faltan: diasParaDia(f.dia) }))
    .filter(f => f.faltan !== null && f.faltan <= 7);
  const lista = [...deudas, ...fijos].sort((a, b) => a.faltan - b.faltan);
  const cuando = n => n === 0 ? 'Vence hoy' : n === 1 ? 'Vence mañana' : 'Vence en ' + n + ' días';

  let h = `<div class="seccion"><h2>Próximo</h2>
    <button class="icono" data-a="ir" data-id="deudas" aria-label="Ver deudas"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg></button>
  </div>`;
  if (!lista.length) {
    return h + `<div class="listo"><div class="circulo"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><p>¡Todo pagado!</p></div>`;
  }
  return h + `<div class="card"><ul class="lista">` + lista.map(x => `
    <li>
      <span class="punto">${x.tipo === 'deuda' ? '💳' : '📅'}</span>
      <span class="txt"><b>${esc(x.nombre)}</b><span>${cuando(x.faltan)} · ${x.tipo === 'deuda' ? 'mínimo ' : ''}${dinero(x.monto)}</span></span>
      <button class="btn chico" data-a="${x.tipo === 'deuda' ? 'pagar' : 'fijoHecho'}" data-id="${x.id}">${x.tipo === 'deuda' ? 'Pagar' : 'Listo'}</button>
    </li>`).join('') + `</ul></div>`;
}


/************************************************************
 * VISTA: INGRESOS (todas las fuentes, sumadas)
 ************************************************************/

function vistaIngresos() {
  const r = resumen(mesVer);
  const esteMes = mesVer === mesActual();
  const fijos = fijosV().filter(f => f.tipo === 'ingreso');
  const recibidos = r.lista.filter(x => x.k === 'mov' && x.tipo === 'ingreso');
  const esperado = suma(fijos, f => f.monto);
  const recibido = suma(recibidos, x => x.monto);
  const pasivoFijo = suma(fijos.filter(f => CAT_PASIVO.includes(f.cat)), f => f.monto);
  const pasivoRec = suma(recibidos.filter(x => CAT_PASIVO.includes(x.cat)), x => x.monto);

  let h = selectorVista();

  h += `<div class="seccion"><h2>Resumen</h2>
      <div class="mes">
        <button data-a="mes" data-id="-1" aria-label="Mes anterior">‹</button>
        <b>${esc(nombreMes(mesVer))}</b>
        <button data-a="mes" data-id="1" aria-label="Mes siguiente" ${esteMes ? 'disabled' : ''}>›</button>
      </div>
    </div>
  <div class="card hero">
    <div class="cuerpo">
      <div class="cifras">
        <div><span>Esperado al mes (fijos)</span><b>${dinero(esperado)}</b></div>
        <div><span>Recibido este mes</span><b class="verde">${dinero(recibido)}</b></div>
        <div><span>Ingreso pasivo</span><b>${dinero(Math.max(pasivoFijo, pasivoRec))}</b></div>
      </div>
      ${anillo(esperado > 0 ? recibido / esperado : (recibido > 0 ? 1 : 0),
        `<b>${esperado > 0 ? Math.round(pct(recibido, esperado)) + '%' : dinero(recibido)}</b><small>${esperado > 0 ? 'recibido' : 'este mes'}</small>`)}
    </div>
    <div class="botones">
      <button class="btn chico principal" data-a="nuevoFijoIngreso">+ Fuente de ingreso</button>
      <button class="btn chico" data-a="regIngreso">+ Registrar cobro</button>
    </div>
  </div>`;

  /* Fuentes fijas, agrupadas por tipo */
  h += `<div class="seccion"><h2>Fuentes de ingreso</h2></div><div class="card">`;
  if (!fijos.length) {
    h += `<p class="chico muted" style="margin:0">Agrega cada fuente de dinero que entra cada mes: salario, negocio, rentas, inversiones, ingresos pasivos o extras. La app las suma y te dice cuánto debería entrar.</p>`;
  } else {
    const porCat = {};
    fijos.forEach(f => { (porCat[f.cat] = porCat[f.cat] || []).push(f); });
    h += Object.keys(CAT_INGRESO).filter(c => porCat[c]).map(c => `
      <div class="fila" style="margin:4px 0 2px"><b>${CAT_INGRESO[c]} ${esc(c)}${CAT_PASIVO.includes(c) ? ' <span class="etiqueta green">pasivo</span>' : ''}</b><b class="verde">${dinero(suma(porCat[c], f => f.monto))}</b></div>
      <ul class="lista" style="margin-bottom:8px">` + porCat[c].map(f => `
        <li><button class="fila-btn" data-a="editarFijo" data-id="${f.id}">
          <span class="punto">${CAT_INGRESO[f.cat] || '💵'}</span>
          <span class="txt"><b>${esc(f.nombre)}${conNegocio() && vistaElegida() === 'todo' && ambitoDe(f) === 'negocio' ? ' <span class="etiqueta blue">🏢</span>' : ''}</b>
            <span>${f.dia ? 'Día ' + f.dia : 'Sin día fijo'}${esteMes ? (fijoHecho(f) ? ' · ✓ ya entró' : ' · pendiente') : ''}</span></span>
          <span class="monto verde">+${dinero(f.monto)}</span>
        </button></li>`).join('') + `</ul>`).join('');
    h += `<div class="fila" style="border-top:1px solid var(--border);padding-top:12px"><b>Total al mes</b><b class="verde" style="font-size:20px">${dinero(esperado)}</b></div>`;
    if (pasivoFijo > 0) h += `<p class="ayuda">De eso, <b>${dinero(pasivoFijo)}</b> (${Math.round(pct(pasivoFijo, esperado))}%) es ingreso pasivo.</p>`;
  }
  h += `</div>`;

  /* Cobros registrados en el mes */
  h += `<div class="seccion"><h2>Cobros de ${esc(nombreMes(mesVer).split(' ')[0].toLowerCase())}</h2></div><div class="card">`;
  h += recibidos.length
    ? `<ul class="lista">` + recibidos.map(x => filaMov(x)).join('') + `</ul>
       <div class="fila" style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px"><b>Total recibido</b><b class="verde" style="font-size:20px">${dinero(recibido)}</b></div>`
    : `<div class="vacio"><span class="emo">💵</span>Todavía no registras cobros este mes. Cuando entre un fijo tócalo en Inicio ("Ya entró") o usa "+ Registrar cobro".</div>`;
  h += `</div>`;

  if (vistaElegida() !== 'personal' && conNegocio()) h += tarjetaPyG() + tarjetaEventos();
  return h;
}

function tarjetaActualizar() {
  if (!versionNueva) return '';
  return `
  <div class="card semaforo green">
    <h2>✨ Hay una versión nueva</h2>
    <p class="chico muted" style="margin:0">Versión ${esc(versionNueva)}. Tus datos no se tocan.</p>
    <div class="botones"><button class="btn chico principal" data-a="actualizar">Actualizar ahora</button></div>
  </div>`;
}

function tarjetaInstalar() {
  if (enPantallaDeInicio()) return '';
  const luego = S.perfil.instalarLuego;
  if (luego && diasEntre(luego, hoy()) < 2) return '';
  return `
  <div class="card">
    <h2>📲 Ponla en tu pantalla de inicio</h2>
    <p class="chico muted" style="margin:0">
      Así se abre como una app y tus datos quedan protegidos. Si la usas solo desde el navegador, el teléfono puede borrarlos cuando pases días sin abrirla.<br><br>
      <b>iPhone:</b> toca Compartir y luego “Agregar a inicio”.<br>
      <b>Android:</b> toca el menú ⋮ y luego “Instalar app”.
    </p>
    <div class="botones">
      ${instalador ? '<button class="btn chico principal" data-a="instalar">Instalar ahora</button>' : ''}
      <button class="btn chico" data-a="instalarLuego">Recordármelo después</button>
    </div>
  </div>`;
}

function tarjetaRespaldo() {
  const registros = S.mov.length + S.deudas.length + S.metas.length + S.cuentas.length;
  if (registros < 3) return '';
  const ultimo = S.perfil.ultimoRespaldo;
  const toca = ultimo ? diasEntre(ultimo, hoy()) >= 7 : diasEntre(S.perfil.inicio || hoy(), hoy()) >= 3;
  if (!toca) return '';
  return `
  <div class="card">
    <h2>💾 Guarda una copia de tus datos</h2>
    <p class="chico muted" style="margin:0">${ultimo
      ? 'Tu última copia es del ' + esc(fechaCorta(ultimo)) + '.'
      : 'Todavía no has guardado ninguna copia.'} Si pierdes o cambias el teléfono, la copia es lo único que te devuelve tus números.</p>
    <div class="botones"><button class="btn chico principal" data-a="respaldar">Guardar copia ahora</button></div>
  </div>`;
}

function tarjetaFijos() {
  let h = `<div class="card"><h2>Fijos del mes</h2>`;
  if (!fijosV().length) {
    h += `<p class="chico muted" style="margin:0">Renta, carro, seguro, salario… Agrégalos una sola vez y cada mes los confirmas con un toque.</p>`;
  } else {
    const orden = fijosV().sort((a, b) => (a.dia || 99) - (b.dia || 99));
    h += `<ul class="lista">` + orden.map(f => {
      const emo = f.tipo === 'ingreso' ? (CAT_INGRESO[f.cat] || '💵') : (CAT_GASTO[f.cat] || '📦');
      return `
        <li>
          <button class="fila-btn" data-a="editarFijo" data-id="${f.id}" style="flex:1;min-width:0;width:auto">
            <span class="punto">${emo}</span>
            <span class="txt"><b>${esc(f.nombre)}</b>
              <span>${f.tipo === 'ingreso' ? '+' : '-'}${dinero(f.monto)}${f.dia ? ' · día ' + f.dia : ''}</span></span>
          </button>
          ${fijoHecho(f)
            ? '<span class="etiqueta green">✓ listo</span>'
            : `<button class="btn chico" data-a="fijoHecho" data-id="${f.id}">${f.tipo === 'ingreso' ? 'Ya entró' : 'Ya lo pagué'}</button>`}
        </li>`;
    }).join('') + `</ul>`;
  }
  h += `<div class="botones">
      <button class="btn chico" data-a="nuevoFijoGasto">+ Gasto fijo</button>
      <button class="btn chico" data-a="nuevoFijoIngreso">+ Ingreso fijo</button>
    </div></div>`;
  return h;
}

function tarjetaDinero() {
  let h = `<div class="card"><h2>Mi dinero</h2>`;
  if (!cuentasV().length) {
    h += `<p class="chico muted" style="margin:0">Agrega tu efectivo y tus cuentas de banco para ver cuánto tienes de verdad. Solo se guardan los últimos 4 números.</p>`;
  } else {
    const tengo = dineroEnCuentas();
    const debo = deudaTotal();
    h += `
    <div class="cuatro" style="margin-top:0">
      <div class="dato"><span>Tienes</span><b class="verde">${dinero(tengo)}</b></div>
      <div class="dato"><span>Debes</span><b>${dinero(debo)}</b></div>
    </div>
    <p class="chico muted" style="margin:8px 0 4px">Lo que tienes menos lo que debes: <b class="${tengo - debo < 0 ? 'rojo' : 'verde'}">${dinero(tengo - debo)}</b></p>
    <ul class="lista">` + cuentasV().map(c => `
      <li><button class="fila-btn" data-a="editarCuenta" data-id="${c.id}">
        <span class="punto">${TIPO_CUENTA[c.tipo] || '📁'}</span>
        <span class="txt"><b>${esc(c.nombre)}${conNegocio() && vistaElegida() === 'todo' && ambitoDe(c) === 'negocio' ? ' <span class="etiqueta blue">🏢</span>' : ''}</b>
          <span>${esc(c.tipo)}${c.ultimos4 ? ' · •••• ' + esc(c.ultimos4) : ''}${c.actualizada ? ' · al ' + esc(fechaCorta(c.actualizada)) : ''}${c.actualizada && diasEntre(c.actualizada, hoy()) > 35 ? ' <span class="etiqueta red">actualizar</span>' : ''}</span></span>
        <span class="monto">${dinero(c.saldo)}</span>
      </button></li>`).join('') + `</ul>`;
  }
  h += `<div class="botones">
      <button class="btn chico" data-a="nuevaCuenta">+ Agregar cuenta o efectivo</button>
      <button class="btn chico" data-a="subirEstado">📄 Subir estado de cuenta</button>
    </div></div>`;
  return h;
}

function filaMov(x) {
  let emo, titulo, sub, monto, clase = '';
  if (x.k === 'pago') {
    emo = '💳'; titulo = 'Pago a ' + x.nombre; sub = 'Deuda'; monto = '-' + dinero(x.monto);
  } else if (x.k === 'aporte') {
    emo = '🏦'; titulo = 'Aporte a ' + x.nombre; sub = 'Ahorro'; monto = '-' + dinero(x.monto);
  } else if (x.tipo === 'ingreso') {
    emo = CAT_INGRESO[x.cat] || '💵'; titulo = x.nota || x.cat; sub = x.cat; monto = '+' + dinero(x.monto); clase = 'verde';
  } else {
    emo = CAT_GASTO[x.cat] || '📦'; titulo = x.nota || nombreCat(x.cat); sub = nombreCat(x.cat) + (x.pago === 'efectivo' ? ' · 💵 efectivo' : ''); monto = '-' + dinero(x.monto);
  }
  return `
    <li><button class="fila-btn" data-a="abrirMov" data-id="${x.k}:${x.id}">
      <span class="punto">${emo}</span>
      <span class="txt"><b>${esc(titulo)}${x.fuga ? ' <span class="etiqueta red">fuga</span>' : ''}</b>
        <span>${esc(sub)} · ${esc(fechaCorta(x.fecha))}${x.foto ? ' · 📎 factura' : ''}</span></span>
      <span class="monto ${clase}">${monto}</span>
    </button></li>`;
}

ACC.mes = id => {
  const d = aFecha(mesVer + '-01');
  d.setMonth(d.getMonth() + Number(id));
  const m = iso(d).slice(0, 7);
  if (m > mesActual()) return;
  mesVer = m;
  pintar();
};
ACC.verRetos = () => ir('retos');
ACC.instalarLuego = () => { S.perfil.instalarLuego = hoy(); guardar(); pintar(); };

ACC.abrirMov = id => {
  const [k, i] = id.split(':');
  if (k === 'mov') {
    const m = S.mov.find(x => x.id === i);
    if (m) formMov(m.tipo, m);
    return;
  }
  const lista = k === 'pago' ? S.pagos : S.aportes;
  const x = lista.find(y => y.id === i);
  if (!x) return;
  hoja(`
    ${cabecera(k === 'pago' ? 'Pago a deuda' : 'Aporte a ahorro')}
    <p class="grande">${dinero(x.monto)}</p>
    <p class="muted">${esc(x.nombre)} · ${esc(fechaCorta(x.fecha))}</p>
    <p class="ayuda">Si lo borras, el saldo ${k === 'pago' ? 'de la deuda vuelve a subir' : 'de la meta vuelve a bajar'} por este monto.</p>
    <div class="botones"><button class="btn peligro" data-a="borrarRegistro" data-id="${k}:${x.id}">Borrar</button></div>`);
};

ACC.borrarRegistro = id => {
  const [k, i] = id.split(':');
  if (k === 'pago') {
    const p = S.pagos.find(x => x.id === i);
    const d = p && S.deudas.find(x => x.id === p.deudaId);
    if (d) d.saldo = r2(d.saldo + p.monto);
    if (p) moverCuenta(p.cuenta, p.monto);
    S.pagos = S.pagos.filter(x => x.id !== i);
  } else {
    const a = S.aportes.find(x => x.id === i);
    const m = a && S.metas.find(x => x.id === a.metaId);
    if (m) m.actual = r2(Math.max(0, m.actual - a.monto));
    S.aportes = S.aportes.filter(x => x.id !== i);
  }
  guardar(); cerrarHoja(); pintar(); aviso('Borrado');
};


/************************************************************
 * FIJOS DEL MES
 ************************************************************/

ACC.nuevoFijoGasto = () => formFijo('gasto');
ACC.nuevoFijoIngreso = () => formFijo('ingreso');
ACC.editarFijo = id => { const f = S.fijos.find(x => x.id === id); if (f) formFijo(f.tipo, f); };

/* El fijo nunca se registra solo: la persona confirma que ya pasó */
ACC.fijoHecho = id => {
  const f = S.fijos.find(x => x.id === id);
  if (!f || fijoHecho(f)) return;
  const m = {
    id: uid(), tipo: f.tipo, monto: f.monto, cat: f.cat, nota: f.nombre,
    fecha: hoy(), fuga: false, cuenta: f.cuenta || '', fijoId: f.id, ambito: ambitoDe(f)
  };
  S.mov.push(m);
  moverCuenta(m.cuenta, signo(m) * m.monto);
  guardar(); pintar();
  aviso(f.tipo === 'ingreso' ? 'Ingreso registrado' : 'Gasto registrado');
};

function formFijo(tipo, f) {
  const gasto = tipo === 'gasto';
  formulario({
    titulo: (f ? 'Editar ' : 'Nuevo ') + (gasto ? 'gasto fijo' : 'ingreso fijo'),
    ayuda: f ? '' : 'Lo escribes una vez. Cada mes aparece en Inicio y lo confirmas con un toque cuando ya pasó.',
    campos: [
      { n: 'nombre', t: 'texto', l: 'Nombre', req: true, ph: gasto ? 'Ej. Renta' : 'Ej. Salario' },
      { n: 'monto', t: 'dinero', l: 'Monto de cada mes', req: true },
      { n: 'cat', t: 'select', l: 'Categoría', ops: Object.keys(gasto ? CAT_GASTO : CAT_INGRESO) },
      { n: 'dia', t: 'numero', l: 'Día del mes en que ocurre', ph: '1 a 31' },
      ...campoCuenta(gasto ? '¿De dónde sale?' : '¿A dónde entra?'),
      ...campoAmbito()
    ],
    valores: f || { cuenta: cuentaPorDefecto(), cat: gasto ? 'Vivienda' : 'Salario', ambito: ambitoPorDefecto() },
    borrar: f ? () => { S.fijos = S.fijos.filter(x => x.id !== f.id); } : null,
    guardar: v => {
      v.dia = Math.max(0, Math.min(31, Math.round(v.dia)));
      if (f) Object.assign(f, v);
      else S.fijos.push({ id: uid(), tipo, ...v });
    }
  });
}


/************************************************************
 * MI DINERO: EFECTIVO Y CUENTAS
 ************************************************************/

ACC.nuevaCuenta = () => formCuenta();
ACC.editarCuenta = id => formCuenta(S.cuentas.find(c => c.id === id));

/* Elegir a qué cuenta corresponde el estado de cuenta que se va a subir */
ACC.subirEstado = () => {
  const lista = cuentasV().filter(c => c.tipo !== 'Efectivo');
  if (!lista.length) return formCuenta(null, true);
  hoja(cabecera('¿De qué cuenta es el estado?') + `<ul class="lista">` + lista.map(c => `
    <li><button class="fila-btn" data-a="estadoDe" data-id="${c.id}">
      <span class="punto">${TIPO_CUENTA[c.tipo] || '📁'}</span>
      <span class="txt"><b>${esc(etiquetaCuenta(c))}</b><span>Hoy: ${dinero(c.saldo)}${c.actualizada ? ' · al ' + esc(fechaCorta(c.actualizada)) : ''}</span></span>
    </button></li>`).join('') + `</ul>
    <div class="botones"><button class="btn" data-a="estadoNueva">+ Es de una cuenta nueva</button></div>`);
};
ACC.estadoDe = id => formCuenta(S.cuentas.find(c => c.id === id), true);
ACC.estadoNueva = () => formCuenta(null, true);

function formCuenta(c, conDocumento) {
  formulario({
    titulo: conDocumento ? '📄 Estado de cuenta' + (c ? ' · ' + c.nombre : '') : c ? 'Editar cuenta' : 'Nueva cuenta o efectivo',
    ayuda: 'Nunca escribas el número completo de la cuenta, ni claves ni contraseñas. Si lo haces, la app solo guarda los últimos 4.',
    campos: [
      { n: 'nombre', t: 'texto', l: 'Nombre', req: true, ph: 'Ej. Efectivo en casa, Cuenta de cheques' },
      { n: 'tipo', t: 'select', l: 'Tipo', ops: Object.keys(TIPO_CUENTA) },
      { n: 'ultimos4', t: 'ultimos4', l: 'Últimos 4 números (opcional)' },
      { n: 'saldo', t: 'dinero', l: conDocumento ? 'Saldo final del estado de cuenta' : '¿Cuánto hay hoy?' },
      { n: 'actualizada', t: 'fecha', l: '¿A qué fecha es ese saldo?' },
      ...campoAmbito()
    ],
    valores: c ? { ...c, actualizada: conDocumento ? '' : (c.actualizada || '') }
      : { tipo: conDocumento ? 'Banco' : S.cuentas.length ? 'Banco' : 'Efectivo', ambito: ambitoPorDefecto(), actualizada: hoy() },
    extra: '<div class="campo" id="zonaArchivo"></div>' + (c && c.historial && c.historial.length > 1 ? historialCuenta(c) : ''),
    alAbrir: form => {
      botonLeerArchivo(form, {
        acepta: 'application/pdf,.pdf,image/*',
        alLeer: (texto, f) => {
          const saldo = buscarMonto(texto, PATRONES_SALDO);
          const fecha = fechaDeCorte(texto);
          /* solo los últimos 4: primero "ending in …", si no, los últimos dígitos del número de cuenta */
          const termina = texto.match(/(?:ending in|termina(?:ci[oó]n)? en|terminación)\D{0,6}(\d{4})\b/i);
          const numCuenta = texto.match(/(?:account\s*(?:number|no\.?|#)|n[uú]mero de cuenta)\D{0,12}([\d][\d\s\-x*•]{3,24})/i);
          const cuatro = termina ? termina[1] : numCuenta ? numCuenta[1].replace(/\D/g, '').slice(-4) : '';
          if (saldo !== null) f.saldo.value = Math.max(0, saldo);
          if (fecha) f.actualizada.value = fecha;
          if (cuatro && !f.ultimos4.value) f.ultimos4.value = cuatro;
          return saldo !== null
            ? `✅ Encontré un saldo final de <b>${dinero(saldo)}</b>${fecha ? ' al ' + esc(fechaCorta(fecha)) : ''}. Revísalo y toca Guardar.`
            : '⚠️ No encontré el saldo final. Búscalo en el documento (suele decir "Ending balance" o "Saldo final") y escríbelo.';
        }
      });
      if (conDocumento) setTimeout(() => $('#inputArchivo') && $('#inputArchivo').click(), 250);
    },
    borrar: c && !conDocumento ? () => { S.cuentas = S.cuentas.filter(x => x.id !== c.id); } : null,
    guardar: v => {
      v.actualizada = v.actualizada || hoy();
      const cuenta = c || { id: uid(), historial: [] };
      const cambio = !c || v.saldo !== c.saldo || v.actualizada !== c.actualizada;
      Object.assign(cuenta, v);
      if (cambio) {
        cuenta.historial = (cuenta.historial || []).filter(h => h.fecha !== v.actualizada);
        cuenta.historial.push({ fecha: v.actualizada, saldo: v.saldo });
        cuenta.historial.sort((a, b) => a.fecha.localeCompare(b.fecha));
        cuenta.historial = cuenta.historial.slice(-24);
      }
      if (!c) S.cuentas.push(cuenta);
      if (conDocumento) aviso('Saldo actualizado');
    }
  });
}

function historialCuenta(c) {
  const ult = c.historial.slice(-6).reverse();
  return `<div class="campo"><span>Saldos anteriores</span><ul class="lista">` + ult.map((h, i) => {
    const prev = ult[i + 1];
    const dif = prev ? h.saldo - prev.saldo : 0;
    return `<li><span class="txt"><b>${esc(fechaCorta(h.fecha))} ${h.fecha.slice(0, 4)}</b></span>
      <span class="monto">${dinero(h.saldo)}${prev ? ` <small class="${dif < 0 ? 'rojo' : 'verde'}">${dif < 0 ? '' : '+'}${dinero(dif)}</small>` : ''}</span></li>`;
  }).join('') + `</ul></div>`;
}


/************************************************************
 * P&L DEL NEGOCIO (estado de resultados)
 ************************************************************/

const etiquetaPeriodo = p => p.meses > 1
  ? nombreMes(p.mes) + ' + ' + (p.meses - 1) + (p.meses === 2 ? ' mes' : ' meses')
  : nombreMes(p.mes);

/* Promedio mensual de los últimos 12 meses registrados */
function pygPromedio() {
  const desde = (() => { const d = new Date(); d.setMonth(d.getMonth() - 12); return iso(d).slice(0, 7); })();
  const lista = S.pyg.filter(p => p.mes >= desde);
  const meses = suma(lista, p => p.meses || 1);
  if (!meses) return null;
  const ing = suma(lista, p => p.ingresos) / meses;
  const gas = suma(lista, p => p.gastos) / meses;
  return { ingresos: r2(ing), gastos: r2(gas), utilidad: r2(ing - gas), meses, registros: lista.length };
}

function tarjetaPyG() {
  if (!conNegocio()) return '';
  const neg = esc(nombreNegocio());
  let h = `<div class="card"><h2>📊 P&L de ${neg}</h2>`;
  if (!S.pyg.length) {
    h += `<p class="chico muted" style="margin:0">Sube el estado de resultados (Profit & Loss) de cada mes, de QuickBooks o de tu contador, o escribe los totales. Con eso la app sabe cuánto gana el negocio y si puede pagar sus deudas sin tocar tu dinero personal.</p>`;
  } else {
    const orden = S.pyg.slice().sort((a, b) => b.mes.localeCompare(a.mes)).slice(0, 6);
    h += `<table class="tabla"><thead><tr><th>Periodo</th><th>Ingresos</th><th>Gastos</th><th>Utilidad</th></tr></thead><tbody>` +
      orden.map(p => {
        const u = p.ingresos - p.gastos;
        return `<tr data-a="editarPyG" data-id="${p.id}" style="cursor:pointer"><th>${esc(etiquetaPeriodo(p))}</th>
          <td>${dinero(p.ingresos)}</td><td>${dinero(p.gastos)}</td><td class="${u < 0 ? 'rojo' : 'verde'}">${dinero(u)}</td></tr>`;
      }).join('') + `</tbody></table>`;
    const pr = pygPromedio();
    if (pr) {
      const n = cifras('negocio');
      const sobra = pr.utilidad - n.minimos;
      h += `<div class="cuatro">
        <div class="dato"><span>Utilidad promedio al mes</span><b class="${pr.utilidad < 0 ? 'rojo' : 'verde'}">${dinero(pr.utilidad)}</b></div>
        <div class="dato"><span>Mínimos de deudas del negocio</span><b>${dinero(n.minimos)}</b></div>
      </div>
      <p class="chico" style="margin:10px 0 0">${pr.utilidad <= 0
        ? `🔴 En promedio el negocio <b>pierde ${dinero(-pr.utilidad)} al mes</b>. Hoy no puede pagar sus deudas con lo que genera.`
        : sobra < 0
          ? `🟡 La utilidad promedio no alcanza para los mínimos: faltan <b>${dinero(-sobra)} al mes</b>, que hoy salen de otro lado.`
          : `🟢 Después de los mínimos le quedan <b>${dinero(sobra)} al mes</b>. Úsalo como "extra" en el plan de salida de la vista Negocio.`}
        <span class="muted">Promedio de ${pr.meses} ${pr.meses === 1 ? 'mes' : 'meses'}.</span></p>`;
    }
  }
  h += `<div class="botones">
      <button class="btn chico principal" data-a="subirPyG">📄 Subir P&L</button>
      <button class="btn chico" data-a="nuevoPyG">+ Escribir un mes</button>
    </div></div>`;
  return h;
}

ACC.subirPyG = () => formPyG(null, true);
ACC.nuevoPyG = () => formPyG();
ACC.editarPyG = id => formPyG(S.pyg.find(p => p.id === id));

function formPyG(p, conDocumento) {
  const mesPasado = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return iso(d).slice(0, 7); })();
  formulario({
    titulo: (p ? 'Editar' : 'Nuevo') + ' P&L · ' + nombreNegocio(),
    ayuda: 'Ingresos = todo lo que vendió o cobró el negocio. Gastos = costos y gastos de operación. Si el reporte cubre varios meses (ej. enero a octubre), indícalo para sacar el promedio mensual.',
    campos: [
      { n: 'mes', t: 'mes', l: 'Mes (o primer mes del periodo)', req: true },
      { n: 'meses', t: 'numero', l: '¿Cuántos meses cubre?', ph: '1' },
      { n: 'ingresos', t: 'dinero', l: 'Ingresos totales', req: true },
      { n: 'gastos', t: 'dinero', l: 'Gastos totales (incluye costo de ventas)' },
      { n: 'nota', t: 'texto', l: 'Nota (opcional)', ph: 'Ej. Incluye evento Puerto Rico' }
    ],
    valores: p || { mes: mesPasado, meses: 1 },
    extra: '<div class="campo" id="zonaArchivo"></div>',
    alAbrir: form => {
      botonLeerArchivo(form, {
        acepta: 'application/pdf,.pdf,image/*',
        alLeer: (texto, f) => {
          const ing = buscarMonto(texto, PATRONES_PYG.ingresos);
          let gas = buscarMonto(texto, PATRONES_PYG.gastos);
          const util = buscarMonto(texto, PATRONES_PYG.utilidad);
          if (ing !== null && util !== null) gas = r2(ing - util);
          const mes = mesDe(texto);
          if (mes) f.mes.value = mes;
          if (ing !== null) f.ingresos.value = ing;
          if (gas !== null) f.gastos.value = Math.max(0, gas);
          const rango = String(texto).match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ene|abr|ago|dic)[a-zé]*\.?\s*(?:\d{1,2},?\s*)?(?:\d{4}\s*)?(?:-|–|to|al|a|through)\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ene|abr|ago|dic)[a-zé]*/i);
          if (rango) {
            const n = numeroMes(rango[2]) - numeroMes(rango[1]) + 1;
            if (n > 1 && n <= 12) {
              f.meses.value = n;
              const anio = (mes || hoy()).slice(0, 4);
              f.mes.value = anio + '-' + String(numeroMes(rango[1])).padStart(2, '0');
            }
          }
          return ing !== null
            ? `✅ Encontré ingresos de <b>${dinero(ing)}</b>${gas !== null ? ', gastos de <b>' + dinero(gas) + '</b>' : ''}${util !== null ? ' y utilidad de <b>' + dinero(util) + '</b>' : ''}${mes ? ' (' + esc(nombreMes(mes)) + ')' : ''}. Revisa el mes y cuántos meses cubre, y toca Guardar.`
            : '⚠️ No encontré los totales. Busca "Total Income" y "Net Income" (o "Ingresos totales" y "Utilidad neta") y escríbelos.';
        }
      });
      if (conDocumento) setTimeout(() => $('#inputArchivo') && $('#inputArchivo').click(), 250);
    },
    borrar: p ? () => { S.pyg = S.pyg.filter(x => x.id !== p.id); } : null,
    guardar: v => {
      v.meses = Math.max(1, Math.min(12, Math.round(v.meses) || 1));
      if (p) {
        Object.assign(p, v);
      } else {
        /* si ya había un P&L del mismo periodo, el nuevo lo reemplaza */
        S.pyg = S.pyg.filter(x => !(x.mes === v.mes && x.meses === v.meses));
        S.pyg.push({ id: uid(), ...v });
      }
    }
  });
}


/************************************************************
 * PRESUPUESTO MENSUAL DE LA CASA (personal)
 ************************************************************/

const presupuestoTotal = () => suma(Object.values(S.presupuesto || {}), x => x);

function tarjetaPresupuesto(r) {
  const gastos = r.lista.filter(x => x.k === 'mov' && x.tipo === 'gasto' && ambitoDe(x) === 'personal');
  const porCat = {};
  gastos.forEach(g => { porCat[g.cat] = (porCat[g.cat] || 0) + g.monto; });
  const plan = S.presupuesto || {};
  const total = presupuestoTotal();
  const gastado = suma(gastos, g => g.monto);
  const fugas = suma(gastos.filter(g => g.fuga), g => g.monto);
  const cats = Object.keys(CAT_GASTO).filter(c => plan[c] > 0 || porCat[c] > 0);
  const compa = comparativo(mesVer);

  let h = `<div class="card"><h2>🏠 Gastos de la casa <small>· ${esc(nombreMes(mesVer))}</small>
    ${fugas ? `<span class="etiqueta red">Fugas ${dinero(fugas)}</span>` : ''}</h2>`;

  if (!total && !gastado) {
    h += `<p class="chico muted" style="margin:0">Define cuánto planeas gastar al mes en comida, vivienda, transporte, servicios, seguros y lo demás. Después, cada gasto que registres se compara contra tu plan.</p>`;
  } else {
    if (total) {
      const resta = total - gastado;
      h += `<div class="cuatro" style="margin:0 0 12px">
        <div class="dato"><span>Planeado</span><b>${dinero(total)}</b></div>
        <div class="dato"><span>${resta >= 0 ? 'Te queda' : 'Te pasaste'}</span><b class="${resta >= 0 ? 'verde' : 'rojo'}">${dinero(Math.abs(resta))}</b></div>
      </div>`;
    }
    h += cats.map(c => {
      const g = porCat[c] || 0;
      const p = plan[c] || 0;
      const pasado = p > 0 && g > p;
      return `<div class="cat">
        <div class="fila"><span>${CAT_GASTO[c]} ${esc(nombreCat(c))} ${(() => { const f = compa.filas.find(x => x.cat === c); return f && compa.hayAnterior ? chip(f.pc, 'baja') : ''; })()}</span>
          <b class="${pasado ? 'rojo' : ''}">${dinero(g)}${p ? ' <small class="muted">de ' + dinero(p) + '</small>' : ''}</b></div>
        <div class="barra ${pasado ? 'roja' : 'azul'}"><i style="width:${p ? pct(g, p) : 100}%"></i></div>
      </div>`;
    }).join('');
  }
  h += `<div class="botones"><button class="btn chico" data-a="editarPresupuesto">${total ? '✎ Editar presupuesto' : 'Definir presupuesto mensual'}</button></div></div>`;
  return h;
}

ACC.editarPresupuesto = () => formulario({
  titulo: 'Presupuesto mensual de la casa',
  ayuda: 'Cuánto planeas gastar cada mes en cada categoría. Deja en blanco lo que no aplique. Los pagos de tarjetas no van aquí: van en Deudas.',
  campos: Object.keys(CAT_GASTO).map(c => ({ n: c, t: 'dinero', l: CAT_GASTO[c] + ' ' + nombreCat(c) + (REFERENCIA_USA[c] ? ' · EE. UU. ≈' + REFERENCIA_USA[c] + '%' : '') })),
  valores: S.presupuesto || {},
  extra: `<div class="botones"><button type="button" class="btn chico" data-a="sugerirPresupuesto">✨ Llenar con el promedio de EE. UU.</button><button type="button" class="btn chico" data-a="categorias">+ Categoría propia</button></div>
    <p class="ayuda">El % es lo que una familia promedio en EE. UU. destina de su ingreso a cada categoría (BLS 2023, aprox.). Es una referencia, no una regla.</p>`,
  guardar: v => {
    S.presupuesto = {};
    Object.entries(v).forEach(([c, m]) => { if (m > 0) S.presupuesto[c] = m; });
  }
});


/************************************************************
 * CATEGORÍAS PROPIAS (productos o servicios que agrega la persona)
 ************************************************************/

const CAT_BASE = { ...CAT_GASTO };

/* Une las categorías de la app con las propias; "Otros" siempre al final */
function reconstruirCats() {
  Object.keys(CAT_GASTO).forEach(k => delete CAT_GASTO[k]);
  const { Otros, ...resto } = CAT_BASE;
  Object.assign(CAT_GASTO, resto, (S && S.catsPropias) || {}, { Otros });
}

const EMOJIS_CAT = ['🛍️', '🏋️', '💇', '🐾', '🙏', '🧹', '🔧', '🧾', '📱', '💊', '🎮', '✈️', '🎁', '🧺', '👶', '🚌', '🅿️', '🏫', '💻', '🍼', '🛠️', '🌿', '⛪', '📦'];

ACC.categorias = () => {
  const propias = Object.entries(S.catsPropias || {});
  formulario({
    titulo: 'Categorías de gastos',
    ayuda: 'Agrega los productos o servicios que pagas y no están en la lista (ej. Gimnasio, Lavandería, Diezmo, Niñera). Aparecen al registrar gastos, en el presupuesto y en las comparaciones.',
    campos: [
      { n: 'nombre', t: 'texto', l: 'Nombre de la categoría nueva', req: true, ph: 'Ej. Gimnasio' },
      { n: 'emoji', t: 'select', l: 'Ícono', ops: EMOJIS_CAT }
    ],
    valores: { emoji: EMOJIS_CAT[0] },
    texto: 'Agregar categoría',
    extra: propias.length ? `<div class="campo"><span>Tus categorías</span><ul class="lista">` + propias.map(([n, e]) => `
      <li><span class="punto">${e}</span><span class="txt"><b>${esc(n)}</b></span>
        <button type="button" class="btn chico peligro" data-a="quitarCat" data-id="${esc(n)}">Quitar</button></li>`).join('') + `</ul></div>` : '',
    guardar: v => {
      const nombre = v.nombre.replace(/\s+/g, ' ').trim().slice(0, 30);
      const existe = Object.keys(CAT_GASTO).find(k => k.toLowerCase() === nombre.toLowerCase());
      if (existe) { aviso('Esa categoría ya existe'); return; }
      S.catsPropias = { ...(S.catsPropias || {}), [nombre]: v.emoji };
      reconstruirCats();
      aviso('Categoría agregada: ' + nombre);
    }
  });
};

ACC.quitarCat = n => {
  if (!S.catsPropias || !S.catsPropias[n]) return;
  delete S.catsPropias[n];
  if (S.presupuesto) delete S.presupuesto[n];
  reconstruirCats(); guardar(); ACC.categorias();
  aviso('Quitada. Los gastos que ya tenías conservan su nombre.');
};


/************************************************************
 * COMPARADOR DE GASTOS (como el análisis de las apps de banco)
 * Compara cada categoría con el mismo punto del mes pasado y
 * con el promedio de los 3 meses anteriores.
 ************************************************************/

function gastosDeMes(m, hastaDia) {
  return resumen(m).lista.filter(x => x.k === 'mov' && x.tipo === 'gasto' &&
    (!hastaDia || Number(x.fecha.slice(8, 10)) <= hastaDia));
}
const agrupar = (lista, campo) => {
  const o = {};
  lista.forEach(g => { const k = g[campo] || 'sin'; o[k] = (o[k] || 0) + g.monto; });
  return o;
};
const nombreMesCorto = m => nombreMes(m).split(' ')[0].toLowerCase();

function comparativo(m = mesVer) {
  const esActual = m === mesActual();
  const dia = esActual ? new Date().getDate() : null;
  const diasMes = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
  const previo = mesAnterior(m);
  const act = gastosDeMes(m);
  const ant = gastosDeMes(previo, dia);
  const historia = [];
  let k = m;
  for (let i = 0; i < 3; i++) { k = mesAnterior(k); historia.push(agrupar(gastosDeMes(k), 'cat')); }
  const conDatos = historia.filter(o => Object.keys(o).length).length;
  const cA = agrupar(act, 'cat'), cB = agrupar(ant, 'cat');
  const cPrevCompleto = agrupar(gastosDeMes(previo), 'cat');

  const filas = [...new Set([...Object.keys(cA), ...Object.keys(cB)])].map(c => {
    const a = r2(cA[c] || 0), b = r2(cB[c] || 0);
    const prom = conDatos ? r2(suma(historia, o => o[c] || 0) / conDatos) : null;
    const proy = esActual && dia ? r2(a * diasMes / dia) : a;
    const pc = cambioPct(a, b || null);
    const importante = b > 0 ? Math.abs(a - b) >= 25 && Math.abs(pc) >= 20 : a >= 50 && conDatos > 0;
    /* Sugerencia: lo que ya llevas este mes o lo normal de un mes completo (promedio o mes pasado) */
    const sugerido = Math.ceil(Math.max(a, prom || cPrevCompleto[c] || 0) / 10) * 10;
    return { cat: c, a, b, prom, proy, pc, dif: r2(a - b), importante, sugerido };
  }).sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif));

  return {
    filas, esActual, dia,
    etq: esActual ? 'vs mismo día de ' + nombreMesCorto(previo) : 'vs ' + nombreMesCorto(previo),
    pagoA: agrupar(act, 'pago'), pagoB: agrupar(ant, 'pago'),
    hayAnterior: ant.length > 0, total: r2(suma(act, g => g.monto)), totalAnt: r2(suma(ant, g => g.monto))
  };
}

function textoAlerta(f, etq) {
  const ic = CAT_GASTO[f.cat] || '📦';
  if (!f.b) return `${ic} <b>${esc(nombreCat(f.cat))}</b>: ${dinero(f.a)} este mes y no tenías gasto ${esc(etq.replace('vs ', 'en el '))}.`;
  return f.dif > 0
    ? `${ic} <b>${esc(nombreCat(f.cat))}</b> subió <b class="rojo">${Math.abs(f.pc).toFixed(0)}%</b> (${dinero(f.dif)} más) ${esc(etq)}.${lineaCosto(f.dif)}`
    : `${ic} <b>${esc(nombreCat(f.cat))}</b> bajó <b class="verde">${Math.abs(f.pc).toFixed(0)}%</b> (${dinero(-f.dif)} menos) ${esc(etq)}. ¡Bien!`;
}

function tarjetaComparar(completa) {
  const c = comparativo(mesVer);
  if (!c.filas.length) return completa ? `<div class="card"><h2>🔍 Cambios en tus gastos</h2><p class="chico muted" style="margin:0">Registra tus gastos con su categoría y forma de pago. Desde el segundo mes verás aquí qué subió, qué bajó y sugerencias para tu presupuesto.</p></div>` : '';
  const plan = S.presupuesto || {};
  const alertas = c.filas.filter(f => f.importante).slice(0, completa ? 10 : 3);
  let h = `<div class="card"><h2>🔍 Cambios en tus gastos <small>· ${esc(nombreMes(mesVer))} ${esc(c.etq)}</small></h2>
    <div class="fila" style="margin-bottom:8px"><span class="chico muted">Total gastado</span><span><b>${dinero(c.total)}</b> ${c.hayAnterior ? chip(cambioPct(c.total, c.totalAnt || null), 'baja') : ''}</span></div>`;

  if (alertas.length) {
    h += `<ul class="consejos">` + alertas.map(f => {
      const ajustar = f.dif > 0 && f.sugerido > (plan[f.cat] || 0);
      return `<li>${textoAlerta(f, c.etq)}
        ${ajustar ? `<div class="botones" style="margin-top:8px"><button class="btn chico" data-a="ajustarPres" data-id="${esc(f.cat)}|${f.sugerido}">Ajustar presupuesto a ${dinero(f.sugerido)}${plan[f.cat] ? ' (hoy ' + dinero(plan[f.cat]) + ')' : ''}</button></div>` : ''}</li>`;
    }).join('') + `</ul>`;
  } else if (c.hayAnterior) {
    h += `<p class="chico muted" style="margin:0">Sin cambios importantes ${esc(c.etq)}. Vas estable.</p>`;
  } else {
    h += `<p class="chico muted" style="margin:0">Todavía no hay gastos del mes anterior para comparar. El próximo mes verás aquí los cambios.</p>`;
  }

  if (completa) {
    h += `<h2 style="margin-top:16px">Por categoría</h2><div class="ticker" style="padding:0">` + c.filas.map(f => `
      <div class="tick">
        <span class="punto">${CAT_GASTO[f.cat] || '📦'}</span>
        <span class="txt"><b>${esc(nombreCat(f.cat))}</b><span>Antes ${dinero(f.b)}${f.prom !== null ? ' · promedio ' + dinero(f.prom) : ''}${plan[f.cat] ? ' · plan ' + dinero(plan[f.cat]) : ''}</span></span>
        <span class="der"><b>${dinero(f.a)}</b>${chip(f.pc, 'baja')}</span>
      </div>`).join('') + `</div>`;
  }

  const formas = Object.keys(FORMAS_PAGO).filter(k => c.pagoA[k] || c.pagoB[k]);
  if (formas.length && (completa || (c.pagoA.efectivo || 0) > (c.pagoB.efectivo || 0) * 1.2 && (c.pagoA.efectivo || 0) >= 50)) {
    h += `<h2 style="margin-top:16px">Por forma de pago</h2><div class="ticker" style="padding:0">` + formas.map(k => {
      const [ic, ...nom] = FORMAS_PAGO[k].split(' ');
      return `<div class="tick"><span class="punto">${ic}</span><span class="txt"><b>${esc(nom.join(' '))}</b><span>Antes ${dinero(c.pagoB[k] || 0)}</span></span>
        <span class="der"><b>${dinero(c.pagoA[k] || 0)}</b>${chip(cambioPct(c.pagoA[k] || 0, c.pagoB[k] || null), 'baja')}</span></div>`;
    }).join('') + `</div>`;
    if ((c.pagoA.efectivo || 0) > (c.pagoB.efectivo || 0) && (c.pagoA.efectivo || 0) >= 50) {
      h += `<p class="ayuda">💵 Tus pagos en efectivo subieron. El efectivo es donde más se esconden las fugas: anota cada pago en cash el mismo día.</p>`;
    }
  }
  if (!completa) h += `<div class="botones"><button class="btn chico" data-a="verComparacion">Ver comparación completa</button></div>`;
  return h + `</div>`;
}

ACC.verComparacion = () => hoja(cabecera('Comparación de gastos') + tarjetaComparar(true));

ACC.ajustarPres = id => {
  const i = id.lastIndexOf('|');
  const cat = id.slice(0, i), monto = Number(id.slice(i + 1));
  if (!cat || !(monto > 0)) return;
  S.presupuesto = S.presupuesto || {};
  S.presupuesto[cat] = monto;
  guardar(); cerrarHoja(); pintar();
  aviso('Presupuesto de ' + nombreCat(cat) + ': ' + dinero(monto));
};


/************************************************************
 * PRESUPUESTO SUGERIDO (referencia: promedio de familias en EE. UU.)
 * Porcentaje aproximado del ingreso que una familia promedio destina a
 * cada categoría (Encuesta de Gastos del Consumidor del BLS, 2023).
 ************************************************************/

const REFERENCIA_USA = {
  'Vivienda': 19, 'Electricidad': 3, 'Agua': 1.2, 'Servicios': 1.2, 'Internet y teléfono': 2.2,
  'Comida': 7.8, 'Restaurantes': 5.1, 'Transporte': 10, 'Gasolina': 3.5, 'Seguros': 3,
  'Salud': 8, 'Cuidado personal': 1.3, 'Educación': 2.1, 'Mascotas': 1, 'Diversión': 3.5,
  'Ropa': 2.6, 'Suscripciones': 1, 'Donaciones': 3.5
};

ACC.sugerirPresupuesto = () => {
  const ingreso = suma(S.fijos.filter(f => f.tipo === 'ingreso' && ambitoDe(f) === 'personal'), f => f.monto);
  if (!ingreso) { aviso('Primero agrega tus ingresos fijos en la pestaña Ingresos'); return; }
  const form = $('#form');
  Object.entries(REFERENCIA_USA).forEach(([c, p]) => {
    if (form.elements[c] && !form.elements[c].value) form.elements[c].value = Math.round(ingreso * p / 100 / 10) * 10;
  });
  aviso('Sugerencia con base en ' + dinero(ingreso) + ' al mes. Ajústala a tu realidad.');
};

/************************************************************
 * CONCIENCIA: EL COSTO REAL DE CADA DECISIÓN
 ************************************************************/

/* Ingreso personal al mes: fijos personales o, si no hay, lo que entró este mes */
function ingresoPersonalMes() {
  const fijos = suma(S.fijos.filter(f => f.tipo === 'ingreso' && ambitoDe(f) === 'personal'), f => f.monto);
  if (fijos) return fijos;
  return suma(S.mov.filter(x => x.tipo === 'ingreso' && ambitoDe(x) === 'personal' && x.fecha.startsWith(mesActual())), x => x.monto);
}
/* Valor de una hora de trabajo (≈173 horas al mes) */
const valorHora = () => ingresoPersonalMes() / 173;

/* Interés promedio de las tarjetas personales con saldo (ponderado por saldo) */
function aprTarjetas() {
  const t = S.deudas.filter(d => ambitoDe(d) === 'personal' && d.saldo > 0 && d.apr > 0);
  const total = suma(t, d => d.saldo);
  return total ? suma(t, d => d.saldo * d.apr) / total : 0;
}

/* Lo que un gasto extra mensual cuesta en un año */
function costoAnual(extraMes) {
  const anual = r2(extraMes * 12);
  const vh = valorHora();
  const apr = aprTarjetas();
  return {
    anual,
    horas: vh > 0 ? Math.round(anual / vh) : null,
    /* si se paga con tarjeta y no se liquida: el saldo crece mes a mes; en promedio ~mitad del año */
    intereses: apr > 0 ? r2(anual * apr / 100 / 2) : 0,
    apr
  };
}

function lineaCosto(extraMes) {
  const c = costoAnual(extraMes);
  if (c.anual < 60) return '';
  return `<span class="costo">💡 Si se repite cada mes: <b>${dinero(c.anual)} al año</b>${c.horas ? ` = <b>${c.horas} horas</b> de tu trabajo` : ''}${c.intereses >= 10 ? `, más ≈ <b>${dinero(c.intereses)}</b> de intereses si va a la tarjeta (${c.apr.toFixed(1)}%)` : ''}.</span>`;
}


/************************************************************
 * SALUD FINANCIERA DE LA CASA (0 a 100)
 * Como un chequeo médico: cada factor suma puntos y dice en
 * palabras sencillas cómo te afecta.
 ************************************************************/

function saludFinanciera() {
  const p = cifras('personal');
  const ingreso = ingresoPersonalMes();
  const factores = [];
  const agregar = (nombre, puntos, max, bien, mal, valor) =>
    factores.push({ nombre, puntos, max, ok: puntos >= max * 0.7, texto: puntos >= max * 0.7 ? bien : mal, valor });

  /* 1. Mínimos de deudas ÷ ingreso */
  if (ingreso > 0) {
    const carga = p.minimos / ingreso * 100;
    agregar('Pagos mínimos ÷ ingreso', carga <= 15 ? 20 : carga <= 30 ? 12 : carga <= 50 ? 5 : 0, 20,
      `Tus mínimos son el ${Math.round(carga)}% de tu ingreso. Tienes margen.`,
      `Tus mínimos se llevan el ${Math.round(carga)}% de tu ingreso. Cualquier imprevisto termina en atraso o en más tarjeta.`, Math.round(carga) + '%');
  } else {
    agregar('Pagos mínimos ÷ ingreso', 5, 20, '', 'Registra tus ingresos fijos para medir cuánto se va en deudas.', '—');
  }

  /* 2. Uso del crédito */
  if (p.limite > 0) {
    agregar('Uso del crédito', p.uso < 30 ? 20 : p.uso < 50 ? 12 : p.uso < 75 ? 5 : 0, 20,
      `Usas el ${Math.round(p.uso)}% de tu crédito. Eso cuida tu puntaje.`,
      `Usas el ${Math.round(p.uso)}% de tu crédito. Arriba del 30% baja tu puntaje y sube el riesgo de que te recorten límites.`, Math.round(p.uso) + '%');
  }

  /* 3. Intereses ÷ ingreso */
  if (ingreso > 0) {
    const pi = p.interesMes / ingreso * 100;
    const horas = valorHora() > 0 ? Math.round(p.interesMes / valorHora()) : null;
    agregar('Intereses que pagas', pi < 5 ? 15 : pi < 15 ? 8 : 0, 15,
      `Pagas ≈ ${dinero(Math.round(p.interesMes))} al mes en intereses. Está bajo control.`,
      `Pagas ≈ ${dinero(Math.round(p.interesMes))} al mes en intereses${horas ? ` = ${horas} horas de tu trabajo cada mes` : ''}. Es dinero que trabajas para el banco.`, dinero(Math.round(p.interesMes)));
  }

  /* 4. Gastos de la casa vs. presupuesto (proporcional al día del mes) */
  const plan = presupuestoTotal();
  const gastado = suma(gastosDeMes(mesActual()).filter(g => ambitoDe(g) === 'personal'), g => g.monto);
  if (plan > 0) {
    const dia = new Date().getDate();
    const diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const esperado = plan * dia / diasMes;
    const exceso = esperado > 0 ? (gastado - esperado) / esperado * 100 : 0;
    agregar('Gastos vs. presupuesto', exceso <= 0 ? 15 : exceso <= 10 ? 8 : 0, 15,
      `Vas en ${dinero(gastado)} de ${dinero(plan)}: dentro de tu plan para el día ${dia}.`,
      `Vas en ${dinero(gastado)} y a esta altura del mes deberías ir en ≈ ${dinero(Math.round(esperado))}. Si sigues así te pasarás del presupuesto.`, Math.round(pct(gastado, plan)) + '%');
  } else {
    agregar('Gastos vs. presupuesto', 5, 15, '', 'No tienes presupuesto de la casa: sin un plan, el dinero decide por ti.', '—');
  }

  /* 5. Colchón: meses que aguantas con lo que tienes en el banco */
  const necesidad = p.gastosFijos + p.minimos + (plan || 0);
  if (necesidad > 0) {
    const meses = p.tengo / necesidad;
    agregar('Colchón de emergencia', meses >= 3 ? 15 : meses >= 1 ? 8 : 0, 15,
      `Tienes para ≈ ${meses.toFixed(1)} meses de gastos y pagos. Buena protección.`,
      `Con lo que tienes en el banco aguantas ≈ ${meses.toFixed(1)} meses. Un imprevisto te empuja a la tarjeta.`, meses.toFixed(1) + ' m');
  }

  /* 6. Fugas y efectivo */
  const gm = gastosDeMes(mesActual()).filter(g => ambitoDe(g) === 'personal');
  const tot = suma(gm, g => g.monto);
  if (tot > 0) {
    const fugas = suma(gm.filter(g => g.fuga || g.pago === 'efectivo' || g.cat === 'Restaurantes'), g => g.monto);
    const pf = fugas / tot * 100;
    agregar('Fugas, efectivo y restaurantes', pf < 10 ? 15 : pf < 25 ? 8 : 0, 15,
      `Solo el ${Math.round(pf)}% de tus gastos son fugas, efectivo o restaurantes.`,
      `El ${Math.round(pf)}% de lo que gastas este mes (${dinero(fugas)}) es fuga, efectivo o restaurante: ahí es donde más se escapa el dinero.`, Math.round(pf) + '%');
  }

  const max = suma(factores, f => f.max);
  const puntos = suma(factores, f => f.puntos);
  const nota = max ? Math.round(puntos / max * 100) : 0;
  const nivel = nota >= 75 ? ['Saludable', 'verde'] : nota >= 50 ? ['Estable, con alertas', 'amarillo'] : nota >= 25 ? ['En riesgo', 'rojo'] : ['Crítica', 'rojo'];
  return { nota, nivel: nivel[0], color: nivel[1], factores };
}

function tarjetaSalud() {
  if (!S.deudas.length && !S.fijos.length && !S.mov.length) return '';
  const s = saludFinanciera();
  const malos = s.factores.filter(f => !f.ok);
  const buenos = s.factores.filter(f => f.ok);
  const colorAnillo = s.color === 'verde' ? '' : 'rojo';
  return `<div class="seccion"><h2>Salud financiera</h2></div>
  <div class="card hero">
    <div class="cuerpo">
      <div class="cifras">
        <div><span>Tu casa hoy</span><b class="${s.color}">${esc(s.nivel)}</b></div>
        <div><span>Lo que la daña</span><b>${malos.length} ${malos.length === 1 ? 'factor' : 'factores'}</b></div>
        <div><span>Lo que la ayuda</span><b>${buenos.length} ${buenos.length === 1 ? 'factor' : 'factores'}</b></div>
      </div>
      ${anillo(s.nota / 100, `<b class="${s.color}">${s.nota}</b><small>de 100</small>`, colorAnillo === 'rojo' && s.nota < 50)}
    </div>
    <ul class="factores">${[...malos, ...buenos].map(f => `
      <li class="${f.ok ? 'ok' : 'mal'}"><b>${f.ok ? '✓' : '⚠'} ${esc(f.nombre)} <span>${esc(f.valor)}</span></b>${esc(f.texto)}</li>`).join('')}</ul>
    <p class="ayuda">Cada decisión mueve esta nota: pagar más que el mínimo, no usar la tarjeta para lo que no puedes pagar este mes y anotar el efectivo la suben.</p>
  </div>`;
}

/************************************************************
 * CALENDARIO DE PAGOS (.ics) PARA EL IPHONE
 * Crea eventos que se repiten cada mes con alarma, sin servidor.
 ************************************************************/

const escICS = t => String(t).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
const fechaICS = f => f.replace(/-/g, '');

function generarICS() {
  const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Control Financiero Familiar//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Pagos · Mi Control'];
  let n = 0;
  const evento = ({ id, fecha, titulo, desc, mensual, dia, alarmas }) => {
    n++;
    L.push('BEGIN:VEVENT', 'UID:' + id + '@control-financiero', 'DTSTAMP:' + sello,
      'DTSTART;VALUE=DATE:' + fechaICS(fecha), 'DTEND;VALUE=DATE:' + fechaICS(sumarDias(fecha, 1)),
      'SUMMARY:' + escICS(titulo), 'DESCRIPTION:' + escICS(desc || ''), 'TRANSP:TRANSPARENT');
    if (mensual) L.push('RRULE:FREQ=MONTHLY;BYMONTHDAY=' + (dia > 28 ? -1 : dia));
    (alarmas || []).forEach(a => L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escICS(titulo), 'TRIGGER:' + a, 'END:VALARM'));
    L.push('END:VEVENT');
  };
  const proxima = dia => sumarDias(hoy(), diasParaDia(dia) || 0);

  S.deudas.filter(d => d.saldo > 0 && d.dia).forEach(d => evento({
    id: 'deuda-' + d.id, fecha: proxima(d.dia), mensual: true, dia: Number(d.dia),
    titulo: '💳 Pagar ' + d.nombre + (d.ultimos4 ? ' ••' + d.ultimos4 : '') + (d.minimo ? ' · mín. ' + dinero(d.minimo) : ''),
    desc: 'Paga al menos el mínimo antes de esta fecha. Si puedes, paga más: cada dólar extra baja los intereses.',
    alarmas: ['-P2DT15H', 'PT9H'] /* 3 días antes a las 9 a.m. y el mismo día a las 9 a.m. */
  }));
  S.fijos.filter(f => f.tipo === 'gasto' && f.dia).forEach(f => evento({
    id: 'fijo-' + f.id, fecha: proxima(f.dia), mensual: true, dia: Number(f.dia),
    titulo: '📅 ' + f.nombre + ' · ' + dinero(f.monto), alarmas: ['-PT15H']
  }));
  S.fijos.filter(f => f.tipo === 'ingreso' && f.dia).forEach(f => evento({
    id: 'ingreso-' + f.id, fecha: proxima(f.dia), mensual: true, dia: Number(f.dia),
    titulo: '💵 Entra ' + f.nombre + ' · ' + dinero(f.monto), desc: 'Antes de gastar: reparte este ingreso (casa, deudas, ahorro).', alarmas: ['PT9H']
  }));
  S.deudas.filter(d => promoActiva(d)).forEach(d => evento({
    id: 'promo-' + d.id, fecha: d.promoFin,
    titulo: '⏳ Termina el ' + (d.apr || 0) + '% de ' + d.nombre + (d.aprDespues ? ' → ' + d.aprDespues + '%' : ''),
    desc: 'Saldo: ' + dinero(d.saldo) + '. Ten listo tu plan antes de esta fecha.',
    alarmas: ['-P30D', '-P7D', '-P1D']
  }));
  (S.eventos || []).filter(e => !e.cerrado && e.fecha && e.fecha >= hoy()).forEach(e => evento({
    id: 'evento-' + e.id, fecha: e.fecha, titulo: '🎪 Evento: ' + e.nombre,
    desc: 'Regla: solo se compra con dinero ya cobrado.', alarmas: ['-P30D', '-P7D']
  }));
  L.push('END:VCALENDAR');
  return { texto: L.join('\r\n') + '\r\n', n };
}

ACC.calendario = () => {
  const { n } = generarICS();
  hoja(`${cabecera('📅 Pagos en tu Calendario')}
    <p class="ayuda">Se crean <b>${n} recordatorios</b> que se repiten cada mes: tus pagos de tarjetas (aviso 3 días antes y el mismo día), gastos e ingresos fijos, fin de promociones (30, 7 y 1 día antes) y tus eventos.</p>
    <div class="botones">
      <button class="btn principal" data-a="calendarioAbrir">Agregar al Calendario</button>
      <button class="btn" data-a="calendarioCompartir">Guardar o compartir archivo</button>
    </div>
    <p class="ayuda">En el iPhone, toca <b>"Agregar todo"</b> cuando aparezca. Si cambias tus tarjetas o fechas, vuelve a generarlo y borra el calendario anterior.</p>`);
};
ACC.calendarioAbrir = () => {
  const { texto } = generarICS();
  window.location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(texto);
};
ACC.calendarioCompartir = async () => {
  const { texto } = generarICS();
  const archivo = new File([texto], 'pagos-mi-control.ics', { type: 'text/calendar' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) { await navigator.share({ files: [archivo], title: 'Pagos · Mi Control' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(archivo); a.download = archivo.name;
  document.body.appendChild(a); a.click(); a.remove();
};


/************************************************************
 * IMPORTAR MOVIMIENTOS (CSV) CON REGLAS DE CATEGORÍAS
 * Amex, Chase, Bank of America, Wells Fargo, Capital One, Discover…
 * Se lee en el teléfono; nada se envía a ningún lado.
 ************************************************************/

/* Reglas incluidas: texto del comercio → categoría (y ámbito si es claramente del negocio) */
const REGLAS_BASE = [
  [/SHELL|EXXON|CHEVRON|\bBP\b|SUNOCO|MARATHON|WAWA|RACETRAC|CITGO|SPEEDWAY|MOBIL|VALERO|CIRCLE K|7-ELEVEN.*FUEL|MURPHY|QT\b|QUIKTRIP|ULTRA TOP FUEL|GAS SE|FUEL/, 'Gasolina'],
  [/PUBLIX|WAL-?MART(?!.*GAS)|KROGER|ALDI|COSTCO|TARGET|WHOLE ?FOODS|SAMS ?CLUB|WINN.?DIXIE|TRADER JOE|SEDANO|FRESCO|FOOD ?LION|HEB\b|SPROUTS|SUPERMARKET|GROCERY/, 'Comida'],
  [/MCDONALD|STARBUCKS|RESTAURANT|GRILL|PIZZA|TACO|CHIPOTLE|WENDY|BURGER|DOORDASH|UBER ?\*? ?EATS|GRUBHUB|STEAK|KPOT|CAFE|BBQ|DUNKIN|CHICK-?FIL|SUBWAY|PANERA|OLIVE GARDEN|LONGHORN|TST\*|SQ \*|DENNY|IHOP|POPEYES|KFC/, 'Restaurantes'],
  [/DUKE ENERGY|TECO|\bFPL\b|FLORIDA POWER|ELECTRIC|ENERGY|POWER CO|WITHLACOOCHEE|SECO ENERGY/, 'Electricidad'],
  [/WATER|UTILIT|SEWER|PASCO COUNTY UTIL/, 'Agua'],
  [/AT&T|VERIZON|T-?MOBILE|SPECTRUM|XFINITY|COMCAST|CRICKET|BOOST|FRONTIER|METRO ?PCS|STARLINK/, 'Internet y teléfono'],
  [/NETFLIX|SPOTIFY|HULU|DISNEY|APPLE\.COM\/BILL|PRIME VIDEO|YOUTUBE|HBO|MAX\.COM|PARAMOUNT|PEACOCK|AUDIBLE|SIRIUS/, 'Suscripciones'],
  [/GEICO|PROGRESSIVE|STATE FARM|ALLSTATE|INSURANCE|SEGURO|LIBERTY MUTUAL|USAA/, 'Seguros'],
  [/CVS|WALGREENS|PHARMACY|CLINIC|MEDICAL|DENTAL|HOSPITAL|DOCTOR|URGENT CARE|LAB ?CORP|QUEST/, 'Salud'],
  [/UBER(?! ?\*? ?EATS)|LYFT|TOLL|SUNPASS|PARKING|E-?TOLL|AUTOZONE|JIFFY|PEP BOYS|CAR ?WASH|ADVANCE AUTO|O.?REILLY|BRIGHTLINE/, 'Transporte'],
  [/DELTA|AMERICAN AIR|SOUTHWEST|UNITED AIR|JETBLUE|SPIRIT|FRONTIER AIR|AVIANCA|HILTON|MARRIOTT|SHERATON|HYATT|EMBASSY|HAMPTON|DOUBLETREE|AIRBNB|EXPEDIA|HOTEL|ALOFT|COURTYARD|SPRINGHILL/, 'Viajes'],
  [/PETSMART|PETCO|CHEWY|VET\b|VETERIN/, 'Mascotas'],
  [/\bRENT\b|LANDLORD|MORTGAGE|HIPOTECA|\bHOA\b|PROPERTY MGMT|APARTMENTS/, 'Vivienda'],
  [/CHURCH|IGLESIA|TITHE|DIEZMO|DONATION|GOFUNDME/, 'Donaciones'],
  [/AMAZON|AMZN/, 'Otros'],
  [/THRYV|HIGHLEVEL|GOHIGHLEVEL|OPENAI|ANTHROPIC|GOOGLE ?\*? ?WORKSPACE|ADOBE|CANVA|ZOOM\.US|VIMEO|TWILIO|KEAP|DIGITALOCEAN|FACEBK|META ?ADS|SKOOL|ELEVENLABS|CHATCUT|DOCUSIGN|SIMVOLY|CAPCUT|TURBODIAL|ALIBABA|QUICKBOOKS|INTUIT|GODADDY|SHOPIFY/, 'Suscripciones', 'negocio']
];

const PATRON_PAGO = /PAYMENT|THANK YOU|PAGO|AUTOPAY|AUTO ?PAY|ONLINE PMT|E-?PAYMENT|CREDIT CRD|CRD EPAY|CARD PMT/i;
const PATRON_INGRESO = /PAYROLL|DIRECT DEP|DEPOSIT|DEP\b|ZELLE FROM|TRANSFER FROM|INTEREST|REFUND|REEMBOLSO|STRIPE|SQUARE INC|PAYPAL TRANSFER/i;

/* Lee CSV (comas, comillas dobles) */
function leerCSV(texto) {
  const filas = []; let fila = [], campo = '', q = false;
  const t = String(texto).replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c;
    } else if (c === '"') q = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter(f => f.some(x => String(x).trim()));
}

function fechaCSV(t) {
  t = String(t).trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { let a = Number(m[3]); if (a < 100) a += 2000; return a + '-' + String(m[1]).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0'); }
  return '';
}
const montoCSV = t => { const s = String(t).trim(); const n = Math.abs(num(s)); return (/^\(|^-|-\$|\$-|\)$/.test(s) ? -1 : 1) * n; };

/* Detecta columnas por nombre (o el formato sin encabezado de Wells Fargo) */
function interpretarCSV(filas) {
  const enc = filas[0].map(x => String(x).toLowerCase().trim());
  const tieneEnc = enc.some(x => /date|fecha|description|descrip|amount|monto|payee|debit|credit/.test(x));
  let iF, iD, iM, iDeb, iCre, datos;
  if (tieneEnc) {
    const busca = (...res) => { for (const re of res) { const i = enc.findIndex(x => re.test(x)); if (i >= 0) return i; } return -1; };
    iF = busca(/^trans(action)?\.? ?date/, /^date$/, /fecha/, /posted date|post date/, /date/);
    iD = busca(/^description$/, /descrip/, /payee|merchant|name/, /memo/);
    iM = busca(/^amount$/, /amount|monto|importe/);
    iDeb = busca(/^debit/, /cargo/);
    iCre = busca(/^credit$/, /^credit/, /abono/);
    datos = filas.slice(1);
  } else {
    /* Wells Fargo: "fecha","monto","*","","descripción" */
    iF = 0; iM = 1; iD = filas[0].length - 1; iDeb = iCre = -1; datos = filas;
  }
  if (iF < 0 || iD < 0 || (iM < 0 && iDeb < 0)) return null;

  let filasMov = datos.map(f => {
    const fecha = fechaCSV(f[iF]);
    const desc = String(f[iD] || '').replace(/\s+/g, ' ').trim();
    let monto;
    if (iM >= 0 && String(f[iM] || '').trim()) monto = montoCSV(f[iM]);
    else monto = (iDeb >= 0 && String(f[iDeb] || '').trim()) ? -Math.abs(num(f[iDeb])) : Math.abs(num(f[iCre] || 0));
    return { fecha, desc, monto };
  }).filter(x => x.fecha && x.desc && x.monto);

  /* ¿Los gastos vienen positivos o negativos? Los pagos/depósitos indican el signo contrario */
  let signoGasto = -1;
  if (iM >= 0) {
    /* Depósitos y nómina siempre son entradas. Los "PAYMENT" son entradas en tarjetas,
       pero salidas en cuentas de banco: por eso los depósitos tienen prioridad. */
    const depositos = filasMov.filter(x => PATRON_INGRESO.test(x.desc));
    const pagos = filasMov.filter(x => PATRON_PAGO.test(x.desc));
    if (depositos.length) signoGasto = suma(depositos, x => Math.sign(x.monto)) > 0 ? -1 : 1;
    else if (pagos.length) signoGasto = suma(pagos, x => Math.sign(x.monto)) > 0 ? -1 : 1;
    else signoGasto = filasMov.filter(x => x.monto < 0).length >= filasMov.length / 2 ? -1 : 1;
  }
  return { filas: filasMov, signoGasto };
}

const claveComercio = d => String(d).toUpperCase().replace(/[^A-Z&\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3).slice(0, 2).join(' ');

function categorizar(desc, ambitoBase) {
  const d = String(desc).toUpperCase();
  for (const r of S.reglas || []) if (r.texto && d.includes(r.texto)) return { cat: r.cat, ambito: r.ambito || ambitoBase };
  for (const [re, cat, amb] of REGLAS_BASE) if (re.test(d)) return { cat, ambito: amb && conNegocio() ? amb : ambitoBase };
  return { cat: 'Otros', ambito: ambitoBase };
}

let importacion = null;

ACC.importar = () => {
  const fuentes = [
    ...S.deudas.map(d => ['d:' + d.id, '💳 ' + d.nombre + (d.ultimos4 ? ' ••' + d.ultimos4 : '')]),
    ...S.cuentas.map(c => ['c:' + c.id, '🏦 ' + etiquetaCuenta(c)]),
    ['', 'Otra / no está en la app']
  ];
  formulario({
    titulo: '📥 Importar movimientos',
    ayuda: 'Descarga de tu banco la actividad en formato CSV (en la web: Statements / Activity → Download → CSV). La app lee fecha, comercio y monto, y los clasifica sola.',
    campos: [
      { n: 'fuente', t: 'select', l: '¿De qué tarjeta o cuenta es el archivo?', ops: fuentes },
      ...(S.eventos && S.eventos.length ? [{ n: 'evento', t: 'select', l: '¿Son de un evento? (opcional)', ops: [['', 'No'], ...S.eventos.filter(e => !e.cerrado).map(e => [e.id, '🎪 ' + e.nombre])] }] : [])
    ],
    valores: {},
    texto: 'Continuar',
    extra: `<div class="campo"><button type="button" class="btn ancho" id="btnCSV">📄 Elegir archivo CSV</button><input type="file" id="inputCSV" hidden>
      <p class="ayuda" id="estadoCSV">Funciona con Amex, Chase, Bank of America, Wells Fargo, Capital One y Discover.</p></div>`,
    alAbrir: form => {
      $('#btnCSV').addEventListener('click', () => $('#inputCSV').click());
      $('#inputCSV').addEventListener('change', async e => {
        const archivo = e.target.files[0];
        if (!archivo) return;
        const r = interpretarCSV(leerCSV(await archivo.text()));
        if (!r || !r.filas.length) { $('#estadoCSV').textContent = 'No reconocí ese archivo. Asegúrate de que sea CSV con fecha, descripción y monto.'; importacion = null; return; }
        importacion = { ...r, archivo: archivo.name };
        $('#estadoCSV').innerHTML = `✅ <b>${r.filas.length} movimientos</b> en ${esc(archivo.name)}. Toca Continuar para revisarlos.`;
      });
    },
    guardar: v => { if (!importacion) { aviso('Primero elige el archivo CSV'); return; } importacion.fuente = v.fuente; importacion.evento = v.evento || ''; setTimeout(revisarImportacion, 50); }
  });
};

function revisarImportacion() {
  const imp = importacion;
  if (!imp) return;
  const [tipoF, idF] = (imp.fuente || ':').split(':');
  const fuente = tipoF === 'd' ? S.deudas.find(d => d.id === idF) : tipoF === 'c' ? S.cuentas.find(c => c.id === idF) : null;
  const ambitoBase = fuente ? ambitoDe(fuente) : ambitoPorDefecto();
  const esTarjeta = tipoF === 'd';
  const existentes = new Set(S.mov.map(m => m.ref).filter(Boolean));

  imp.items = imp.filas.map((x, i) => {
    const gasto = Math.sign(x.monto) === imp.signoGasto;
    const ref = x.fecha + '|' + Math.abs(x.monto).toFixed(2) + '|' + x.desc.slice(0, 24).toUpperCase();
    let tipo = gasto ? 'gasto' : 'ingreso', motivo = '';
    if (PATRON_PAGO.test(x.desc) && (esTarjeta ? !gasto : gasto)) { tipo = 'omitir'; motivo = esTarjeta ? 'pago a la tarjeta' : 'pago de tarjeta (ya cuenta en Deudas)'; }
    else if (esTarjeta && !gasto) { tipo = 'omitir'; motivo = 'devolución o crédito'; }
    if (existentes.has(ref)) { tipo = 'omitir'; motivo = 'ya importado'; }
    const c = tipo === 'ingreso' ? { cat: /PAYROLL|DIRECT DEP/i.test(x.desc) ? 'Salario' : 'Otros', ambito: ambitoBase } : categorizar(x.desc, ambitoBase);
    return { i, ...x, monto: Math.abs(x.monto), tipo, motivo, ref, cat: c.cat, ambito: c.ambito, catAuto: c.cat, ambAuto: c.ambito };
  });

  const validos = imp.items.filter(x => x.tipo !== 'omitir');
  const gastos = validos.filter(x => x.tipo === 'gasto');
  const opsCat = t => Object.keys(t === 'gasto' ? CAT_GASTO : CAT_INGRESO);
  hoja(`${cabecera('Revisa antes de importar')}
    <p class="ayuda"><b>${validos.length}</b> por importar (${gastos.length} gastos · ${dinero(suma(gastos, x => x.monto))}) · ${imp.items.length - validos.length} omitidos.
      Cambia la categoría si hace falta: la app <b>aprende</b> y la próxima vez lo clasifica sola.</p>
    <ul class="lista importar">${imp.items.map(x => x.tipo === 'omitir' ? `
      <li class="omitido"><span class="txt"><b>${esc(x.desc)}</b><span>${esc(fechaCorta(x.fecha))} · ${esc(x.motivo)}</span></span><span class="monto muted">${dinero(x.monto)}</span></li>` : `
      <li data-i="${x.i}">
        <span class="txt"><b>${esc(x.desc)}</b><span>${esc(fechaCorta(x.fecha))}${x.tipo === 'ingreso' ? ' · ingreso' : ''}</span>
          <span class="selects">
            <select data-campo="cat">${opsCat(x.tipo).map(c => `<option value="${esc(c)}" ${c === x.cat ? 'selected' : ''}>${esc((x.tipo === 'gasto' ? CAT_GASTO[c] : CAT_INGRESO[c]) + ' ' + nombreCat(c))}</option>`).join('')}</select>
            ${conNegocio() ? `<select data-campo="ambito"><option value="personal" ${x.ambito === 'personal' ? 'selected' : ''}>🏠 Casa</option><option value="negocio" ${x.ambito === 'negocio' ? 'selected' : ''}>🏢 Negocio</option></select>` : ''}
          </span></span>
        <span class="monto ${x.tipo === 'ingreso' ? 'verde' : ''}">${x.tipo === 'ingreso' ? '+' : '-'}${dinero(x.monto)}</span>
      </li>`).join('')}</ul>
    <div class="botones"><button class="btn principal" data-a="confirmarImportacion">Importar ${validos.length} movimientos</button></div>`);
}

ACC.confirmarImportacion = () => {
  const imp = importacion;
  if (!imp || !imp.items) return;
  const [tipoF, idF] = (imp.fuente || ':').split(':');
  const fuente = tipoF === 'd' ? S.deudas.find(d => d.id === idF) : tipoF === 'c' ? S.cuentas.find(c => c.id === idF) : null;
  const ambFuente = fuente ? ambitoDe(fuente) : 'personal';
  document.querySelectorAll('.importar li[data-i]').forEach(li => {
    const x = imp.items[Number(li.dataset.i)];
    li.querySelectorAll('select').forEach(s => { x[s.dataset.campo] = s.value; });
  });
  S.reglas = S.reglas || [];
  let nuevos = 0, aprendidas = 0;
  imp.items.filter(x => x.tipo !== 'omitir').forEach(x => {
    S.mov.push({
      id: uid(), tipo: x.tipo, monto: r2(x.monto), cat: x.cat, nota: x.desc.slice(0, 60), fecha: x.fecha,
      fuga: false, cuenta: '', ambito: x.ambito, ref: x.ref,
      pago: tipoF === 'd' ? 'credito' : tipoF === 'c' ? 'debito' : undefined,
      origen: x.ambito === 'negocio' ? (ambFuente === 'negocio' ? 'negocio' : 'casa') : undefined,
      evento: imp.evento || undefined,
      importado: imp.archivo
    });
    nuevos++;
    if (x.tipo === 'gasto' && (x.cat !== x.catAuto || x.ambito !== x.ambAuto)) {
      const texto = claveComercio(x.desc);
      if (texto && !S.reglas.some(r => r.texto === texto)) { S.reglas.push({ texto, cat: x.cat, ambito: x.ambito }); aprendidas++; }
    }
  });
  importacion = null;
  guardar(); cerrarHoja(); pintar();
  aviso(`✅ ${nuevos} movimientos importados${aprendidas ? ' · ' + aprendidas + ' reglas aprendidas' : ''}`);
};

ACC.reglas = () => {
  const r = S.reglas || [];
  hoja(`${cabecera('Reglas de categorías')}
    <p class="ayuda">La app las aprende cuando corriges una categoría al importar. Si el comercio contiene el texto, se clasifica así.</p>
    ${r.length ? `<ul class="lista">${r.map((x, i) => `<li><span class="punto">${CAT_GASTO[x.cat] || '📦'}</span>
      <span class="txt"><b>${esc(x.texto)}</b><span>→ ${esc(nombreCat(x.cat))}${x.ambito === 'negocio' ? ' · 🏢 negocio' : ''}</span></span>
      <button class="btn chico peligro" data-a="quitarRegla" data-id="${i}">Quitar</button></li>`).join('')}</ul>`
      : '<div class="vacio"><span class="emo">🧠</span>Todavía no hay reglas. Se crean solas al importar.</div>'}`);
};
ACC.quitarRegla = i => { (S.reglas || []).splice(Number(i), 1); guardar(); ACC.reglas(); };


/************************************************************
 * NEGOCIO ↔ CASA: LO QUE EL NEGOCIO LE DEBE A TU CASA
 * Suma los gastos del negocio pagados con dinero o tarjetas
 * personales y resta lo que el negocio te reembolsa.
 ************************************************************/

function cuentaNegocioCasa() {
  if (S.perfil.negocioDebeInicial === undefined || S.perfil.negocioDebeInicial === null) {
    S.perfil.negocioDebeInicial = r2(deNegocioTotal());
    S.perfil.negocioDebeDesde = hoy();
  }
  const inicial = S.perfil.negocioDebeInicial || 0;
  const gastos = S.mov.filter(m => m.tipo === 'gasto' && ambitoDe(m) === 'negocio' && m.origen === 'casa');
  const movs = S.reembolsos || [];
  const pagado = suma(gastos, m => m.monto);
  const reembolsos = suma(movs.filter(x => x.tipo === 'reembolso'), x => x.monto);
  const prestamos = suma(movs.filter(x => x.tipo === 'prestamo'), x => x.monto);
  return { inicial, pagado, reembolsos, prestamos, saldo: r2(inicial + pagado + prestamos - reembolsos), gastos, movs };
}

function tarjetaNegocioCasa() {
  if (!conNegocio()) return '';
  const c = cuentaNegocioCasa();
  const neg = esc(nombreNegocio());
  const ultimos = [
    ...c.gastos.map(m => ({ fecha: m.fecha, txt: m.nota || nombreCat(m.cat), monto: m.monto, signo: '+' })),
    ...c.movs.map(x => ({ fecha: x.fecha, txt: x.tipo === 'reembolso' ? 'Reembolso del negocio' : 'Préstamo de la casa al negocio', monto: x.monto, signo: x.tipo === 'reembolso' ? '-' : '+', id: x.id }))
  ].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 6);
  return `<div class="seccion"><h2>Negocio ↔ Casa</h2></div>
  <div class="card">
    <span class="muted chico">${neg} le debe a tu casa</span>
    <p class="grande ${c.saldo > 0 ? 'rojo' : 'verde'}">${dinero(c.saldo)}</p>
    <div class="cuatro" style="margin-top:6px">
      <div class="dato"><span>Saldo inicial</span><b>${dinero(c.inicial)}</b></div>
      <div class="dato"><span>Gastos del negocio pagados por la casa</span><b>+${dinero(c.pagado)}</b></div>
      <div class="dato"><span>Préstamos al negocio</span><b>+${dinero(c.prestamos)}</b></div>
      <div class="dato"><span>Reembolsos recibidos</span><b class="verde">-${dinero(c.reembolsos)}</b></div>
    </div>
    ${ultimos.length ? `<ul class="lista" style="margin-top:10px">${ultimos.map(u => `<li><span class="txt"><b>${esc(u.txt)}</b><span>${esc(fechaCorta(u.fecha))}</span></span>
      <span class="monto ${u.signo === '-' ? 'verde' : ''}">${u.signo}${dinero(u.monto)}</span>${u.id ? `<button class="btn chico" data-a="borrarReembolso" data-id="${u.id}">✕</button>` : ''}</li>`).join('')}</ul>` : ''}
    <p class="ayuda">${c.saldo > 0 ? `Cada reembolso que te haga ${neg}, úsalo para bajar la tarjeta personal de interés más alto. Y desde hoy: gastos del negocio con tarjetas del negocio.` : 'Tu casa y tu negocio están a mano. Mantenlo así: cada gasto en su lado.'}</p>
    <div class="botones">
      <button class="btn chico principal" data-a="nuevoReembolso" data-id="reembolso">+ Reembolso del negocio</button>
      <button class="btn chico" data-a="nuevoReembolso" data-id="prestamo">+ Préstamo al negocio</button>
      <button class="btn chico" data-a="ajustarInicialNegocio">Ajustar saldo inicial</button>
    </div>
  </div>`;
}

ACC.nuevoReembolso = tipo => formulario({
  titulo: tipo === 'prestamo' ? 'Préstamo de la casa al negocio' : 'Reembolso del negocio a la casa',
  ayuda: tipo === 'prestamo' ? 'Dinero personal que pusiste en el negocio. Aumenta lo que el negocio te debe.' : 'Dinero que el negocio te devolvió por gastos que pagaste con lo personal. Baja lo que te debe.',
  campos: [
    { n: 'monto', t: 'dinero', l: 'Monto', req: true },
    { n: 'fecha', t: 'fecha', l: 'Fecha' },
    { n: 'nota', t: 'texto', l: 'Nota (opcional)', ph: 'Ej. Transferencia de la cuenta de la LLC' }
  ],
  valores: { fecha: hoy() },
  guardar: v => { S.reembolsos = S.reembolsos || []; S.reembolsos.push({ id: uid(), tipo, ...v, fecha: v.fecha || hoy() }); aviso('Registrado'); }
});
ACC.borrarReembolso = id => { S.reembolsos = (S.reembolsos || []).filter(x => x.id !== id); guardar(); pintar(); };
ACC.ajustarInicialNegocio = () => formulario({
  titulo: 'Saldo inicial negocio → casa',
  ayuda: 'Lo que el negocio ya te debía cuando empezaste a llevar esta cuenta (por ejemplo, la parte de tus tarjetas personales que son gastos del negocio). Se calculó con lo que marcaste en tus deudas.',
  campos: [{ n: 'monto', t: 'dinero', l: 'Saldo inicial' }],
  valores: { monto: S.perfil.negocioDebeInicial || '' },
  guardar: v => { S.perfil.negocioDebeInicial = v.monto; }
});


/************************************************************
 * EVENTOS: PRESUPUESTO Y P&L DE CADA EVENTO
 * Regla de oro: no se compra con tarjeta lo que no se ha cobrado.
 ************************************************************/

function cifrasEvento(e) {
  const movs = S.mov.filter(m => m.evento === e.id);
  const gastado = r2(suma(movs.filter(m => m.tipo === 'gasto'), m => m.monto));
  const cobrado = r2(suma(movs.filter(m => m.tipo === 'ingreso'), m => m.monto));
  return { movs, gastado, cobrado, utilidad: r2(cobrado - gastado), financiado: r2(Math.max(0, gastado - cobrado)) };
}

function tarjetaEventos() {
  if (!conNegocio()) return '';
  const lista = (S.eventos || []).slice().sort((a, b) => (a.cerrado - b.cerrado) || String(b.fecha).localeCompare(String(a.fecha)));
  let h = `<div class="seccion"><h2>Eventos</h2><button class="icono" data-a="nuevoEvento" aria-label="Nuevo evento"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button></div>`;
  if (!lista.length) {
    return h + `<div class="card"><p class="chico muted" style="margin:0">Crea cada evento (ej. Puerto Rico, Columbus) con su presupuesto y la meta de ventas. Asigna los gastos y cobros al evento y verás si deja ganancia, y si lo estás financiando con tarjetas.</p>
      <div class="botones"><button class="btn chico principal" data-a="nuevoEvento">+ Nuevo evento</button></div></div>`;
  }
  return h + lista.map(e => {
    const c = cifrasEvento(e);
    const pp = e.presupuesto ? pct(c.gastado, e.presupuesto) : 0;
    return `<div class="card ${c.financiado > 0 && !e.cerrado ? 'semaforo red' : ''}">
      <div class="fila"><h2 style="margin:0">🎪 ${esc(e.nombre)} <small>${e.fecha ? '· ' + esc(fechaCorta(e.fecha)) : ''}${e.cerrado ? ' · cerrado' : ''}</small></h2>
        <button class="btn chico" data-a="editarEvento" data-id="${e.id}">✎</button></div>
      <div class="cuatro">
        <div class="dato"><span>Cobrado</span><b class="verde">${dinero(c.cobrado)}</b>${e.meta ? `<span>meta ${dinero(e.meta)}</span>` : ''}</div>
        <div class="dato"><span>Gastado</span><b>${dinero(c.gastado)}</b>${e.presupuesto ? `<span>de ${dinero(e.presupuesto)}</span>` : ''}</div>
        <div class="dato"><span>${c.utilidad >= 0 ? 'Ganancia' : 'Pérdida'}</span><b class="${c.utilidad >= 0 ? 'verde' : 'rojo'}">${dinero(c.utilidad)}</b></div>
        <div class="dato"><span>Financiado con deuda</span><b class="${c.financiado > 0 ? 'rojo' : ''}">${dinero(c.financiado)}</b></div>
      </div>
      ${e.presupuesto ? `<div class="barra ${pp >= 100 ? 'roja' : 'azul'}"><i style="width:${pp}%"></i></div>` : ''}
      ${c.financiado > 0 && !e.cerrado ? `<p class="chico rojo" style="margin:8px 0 0">⚠ Has gastado ${dinero(c.financiado)} más de lo cobrado: ese dinero sale de tarjetas o de tu casa. No compres más hasta cobrar.</p>` : ''}
    </div>`;
  }).join('');
}

ACC.nuevoEvento = () => formEvento();
ACC.editarEvento = id => formEvento((S.eventos || []).find(e => e.id === id));

function formEvento(e) {
  formulario({
    titulo: e ? 'Editar evento' : 'Nuevo evento',
    ayuda: 'Define el presupuesto ANTES de comprar. Asigna los gastos y cobros al evento al registrarlos o al importar.',
    campos: [
      { n: 'nombre', t: 'texto', l: 'Nombre', req: true, ph: 'Ej. Encuentro Puerto Rico 2027' },
      { n: 'fecha', t: 'fechaFutura', l: 'Fecha del evento' },
      { n: 'presupuesto', t: 'dinero', l: 'Presupuesto de gastos (vuelos, hoteles, local…)' },
      { n: 'meta', t: 'dinero', l: 'Meta de ventas / cobros' },
      ...(e ? [{ n: 'cerrado', t: 'check', l: 'Evento cerrado' }] : [])
    ],
    valores: e || {},
    borrar: e ? () => { S.eventos = S.eventos.filter(x => x.id !== e.id); S.mov.forEach(m => { if (m.evento === e.id) delete m.evento; }); } : null,
    guardar: v => {
      S.eventos = S.eventos || [];
      if (e) Object.assign(e, v); else S.eventos.push({ id: uid(), cerrado: false, ...v });
    }
  });
}

/************************************************************
 * BIENVENIDA GUIADA: 5 PASOS PARA ARMAR TU MAPA (≈10 MINUTOS)
 * 1 Ingresos · 2 Gastos fijos · 3 Deudas · 4 Dinero · 5 Presupuesto
 ************************************************************/

const PASOS_GUIA = [
  { n: 1, clave: 'ingresos', titulo: '¿Cuánto dinero entra cada mes?', icono: '💵',
    ayuda: 'Anota cada fuente: salario, negocio, rentas, ayudas. Si cobras cada 15 días, pon el total del mes.' },
  { n: 2, clave: 'fijos', titulo: '¿Qué pagas fijo cada mes?', icono: '📅',
    ayuda: 'Llena solo lo que aplica. Lo que dejes vacío no se guarda. Los pagos de tarjetas van en el siguiente paso.' },
  { n: 3, clave: 'deudas', titulo: '¿Qué debes?', icono: '💳',
    ayuda: 'Tarjetas, préstamos, carro, préstamos familiares. Con el saldo, el interés (APR) y el mínimo armamos tu plan de salida.' },
  { n: 4, clave: 'dinero', titulo: '¿Cuánto tienes hoy?', icono: '🏦',
    ayuda: 'Lo que hay hoy en tus cuentas y en efectivo. Solo los últimos 4 números, nunca el número completo.' },
  { n: 5, clave: 'presupuesto', titulo: 'Tu presupuesto del mes', icono: '🏠',
    ayuda: 'Te sugerimos montos según tus ingresos y el promedio de familias en EE. UU. Ajústalos a tu realidad.' }
];

const FIJOS_SUGERIDOS = [
  ['Renta o hipoteca', 'Vivienda'], ['Electricidad', 'Electricidad'], ['Agua', 'Agua'],
  ['Internet y celular', 'Internet y teléfono'], ['Pago del carro', 'Transporte'], ['Seguro del carro', 'Seguros'],
  ['Seguro médico', 'Salud'], ['Escuela o guardería', 'Hijos'], ['Diezmo o donación', 'Donaciones']
];

/* Estado de cada paso: ¿ya tiene datos? */
const pasoListo = {
  ingresos: () => S.fijos.some(f => f.tipo === 'ingreso'),
  fijos: () => S.fijos.some(f => f.tipo === 'gasto') || !!(S.perfil.guiaSaltados || {}).fijos,
  deudas: () => S.deudas.length > 0 || S.perfil.sinDeudas,
  dinero: () => S.cuentas.length > 0,
  presupuesto: () => presupuestoTotal() > 0
};

function inputGuia(c, v) {
  const val = v ?? '';
  if (c.t === 'select') {
    return `<label class="g-${c.n}"><span>${esc(c.l)}</span><select data-campo="${c.n}">${c.ops.map(o => {
      const [k, t] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(k)}" ${k === val ? 'selected' : ''}>${esc(t)}</option>`;
    }).join('')}</select></label>`;
  }
  const dec = c.t === 'dinero' || c.t === 'numero';
  return `<label class="g-${c.n}"><span>${esc(c.l)}</span><input data-campo="${c.n}" type="text" ${dec ? 'inputmode="decimal"' : ''} autocomplete="off"
    value="${val === 0 ? '' : esc(val)}" placeholder="${esc(c.ph || (dec ? '0' : ''))}"></label>`;
}

let plantillaFila = null;
const filaGuia = (campos, v = {}) => `<div class="fila-guia">${campos.map(c => inputGuia(c, v[c.n])).join('')}
  <button type="button" class="quitar" data-a="guiaQuitar" aria-label="Quitar">✕</button></div>`;

function camposPaso(clave) {
  const amb = conNegocio() ? [{ n: 'ambito', t: 'select', l: 'De', ops: [['personal', '🏠 Casa'], ['negocio', '🏢 Negocio']] }] : [];
  if (clave === 'ingresos') return [
    { n: 'nombre', l: 'Fuente', ph: 'Ej. Salario' }, { n: 'monto', t: 'dinero', l: 'Al mes' },
    { n: 'dia', t: 'numero', l: 'Día', ph: '15' }, { n: 'cat', t: 'select', l: 'Tipo', ops: Object.keys(CAT_INGRESO) }, ...amb];
  if (clave === 'fijos') return [
    { n: 'nombre', l: 'Gasto', ph: 'Ej. Gimnasio' }, { n: 'monto', t: 'dinero', l: 'Al mes' },
    { n: 'dia', t: 'numero', l: 'Día', ph: '1' }, { n: 'cat', t: 'select', l: 'Categoría', ops: Object.keys(CAT_GASTO).map(c => [c, CAT_GASTO[c] + ' ' + nombreCat(c)]) }];
  if (clave === 'deudas') return [
    { n: 'nombre', l: 'Tarjeta o préstamo', ph: 'Ej. Visa del banco' }, { n: 'saldo', t: 'dinero', l: 'Debes' },
    { n: 'apr', t: 'numero', l: 'Interés %', ph: '24.99' }, { n: 'minimo', t: 'dinero', l: 'Mínimo' },
    { n: 'dia', t: 'numero', l: 'Día de pago', ph: '15' }, { n: 'limite', t: 'dinero', l: 'Límite' }, ...amb];
  if (clave === 'dinero') return [
    { n: 'nombre', l: 'Cuenta', ph: 'Ej. Cheques' }, { n: 'saldo', t: 'dinero', l: 'Hay hoy' },
    { n: 'tipo', t: 'select', l: 'Tipo', ops: Object.keys(TIPO_CUENTA) }, ...amb];
  return [];
}

function filasIniciales(clave) {
  if (clave === 'ingresos') return S.fijos.some(f => f.tipo === 'ingreso') ? [{}] : [{ nombre: 'Salario', cat: 'Salario' }];
  if (clave === 'fijos') {
    const ya = new Set(S.fijos.map(f => f.nombre.toLowerCase()));
    return FIJOS_SUGERIDOS.filter(([n]) => !ya.has(n.toLowerCase())).map(([nombre, cat]) => ({ nombre, cat }));
  }
  if (clave === 'deudas') return [{}, {}];
  if (clave === 'dinero') return S.cuentas.length ? [{ tipo: 'Banco' }] : [{ nombre: 'Cuenta de cheques', tipo: 'Banco' }, { nombre: 'Ahorros', tipo: 'Ahorros' }, { nombre: 'Efectivo', tipo: 'Efectivo' }];
  return [];
}

function yaRegistrado(clave) {
  let lista = [];
  if (clave === 'ingresos') lista = S.fijos.filter(f => f.tipo === 'ingreso').map(f => f.nombre + ' ' + dinero(f.monto));
  if (clave === 'fijos') lista = S.fijos.filter(f => f.tipo === 'gasto').map(f => f.nombre + ' ' + dinero(f.monto));
  if (clave === 'deudas') lista = S.deudas.map(d => d.nombre + ' ' + dinero(d.saldo));
  if (clave === 'dinero') lista = S.cuentas.map(c => c.nombre + ' ' + dinero(c.saldo));
  return lista.length ? `<p class="ayuda">Ya tienes: ${lista.slice(0, 6).map(esc).join(' · ')}${lista.length > 6 ? ' y ' + (lista.length - 6) + ' más' : ''}. Agrega solo lo que falte.</p>` : '';
}

function sugerenciaPresupuesto() {
  const ingreso = ingresoPersonalMes();
  const porFijos = {};
  S.fijos.filter(f => f.tipo === 'gasto' && ambitoDe(f) === 'personal').forEach(f => { porFijos[f.cat] = (porFijos[f.cat] || 0) + f.monto; });
  const cats = [...new Set([...Object.keys(REFERENCIA_USA), ...Object.keys(porFijos)])].filter(c => CAT_GASTO[c]);
  return cats.map(c => {
    const ref = ingreso && REFERENCIA_USA[c] ? Math.round(ingreso * REFERENCIA_USA[c] / 100 / 10) * 10 : 0;
    const fijo = Math.ceil((porFijos[c] || 0) / 10) * 10;
    return { cat: c, valor: (S.presupuesto || {})[c] || Math.max(ref, fijo), ref, fijo };
  });
}

function abrirGuia(n) {
  const p = PASOS_GUIA[n - 1];
  if (!p) return resumenGuia();
  S.perfil.guiaPaso = n; guardar();
  const puntos = PASOS_GUIA.map(x => `<i class="${x.n < n ? 'hecho' : x.n === n ? 'actual' : ''}"></i>`).join('');
  let cuerpo = '';
  if (p.clave === 'presupuesto') {
    const ingreso = ingresoPersonalMes();
    const sug = sugerenciaPresupuesto();
    cuerpo = `${ingreso ? `<p class="ayuda">Con un ingreso de <b>${dinero(ingreso)}</b> al mes. Incluye tus gastos fijos.</p>` : '<p class="ayuda">Sin ingresos registrados no podemos sugerir montos. Escríbelos tú o vuelve al paso 1.</p>'}
      <div class="presu-guia">${sug.map(s => `<label><span>${CAT_GASTO[s.cat]} ${esc(nombreCat(s.cat))}${s.ref ? ` <small>EE. UU. ≈${REFERENCIA_USA[s.cat]}%</small>` : ''}</span>
        <input data-cat="${esc(s.cat)}" type="text" inputmode="decimal" value="${s.valor || ''}" placeholder="0"></label>`).join('')}</div>
      ${ingreso ? `<p class="ayuda" id="totalPresu"></p>` : ''}`;
  } else {
    const campos = camposPaso(p.clave);
    plantillaFila = filaGuia(campos);
    cuerpo = yaRegistrado(p.clave) +
      `<div id="filasGuia">${filasIniciales(p.clave).map(v => filaGuia(campos, v)).join('')}</div>
      <button type="button" class="btn chico ancho" data-a="guiaFila">+ Agregar otro</button>
      ${p.clave === 'deudas' ? `<label class="campo check"><input type="checkbox" id="sinDeudasGuia" ${S.perfil.sinDeudas ? 'checked' : ''}><span>No tengo deudas</span></label>` : ''}
      ${p.clave === 'dinero' ? `<p class="ayuda">¿Prefieres leerlo de un PDF? Termina la guía y usa <b>+ → Estado de cuenta</b>.</p>` : ''}`;
  }
  hoja(`
    <div class="fila"><span class="chico muted">Paso ${n} de ${PASOS_GUIA.length}</span><button class="cerrar" data-a="guiaCerrar" aria-label="Cerrar">✕</button></div>
    <div class="puntos-guia">${puntos}</div>
    <h2 style="margin-top:12px">${p.icono} ${esc(p.titulo)}</h2>
    <p class="ayuda">${esc(p.ayuda)}</p>
    <div id="guia" data-clave="${p.clave}">${cuerpo}</div>
    <div class="botones">
      ${n > 1 ? '<button class="btn" data-a="guiaAtras">‹ Atrás</button>' : ''}
      <button class="btn" data-a="guiaSaltar">Saltar</button>
      <button class="btn principal" data-a="guiaSiguiente">${n === PASOS_GUIA.length ? 'Terminar ✓' : 'Siguiente ›'}</button>
    </div>`);
  const tot = $('#totalPresu');
  if (tot) {
    const calc = () => {
      const t = [...document.querySelectorAll('.presu-guia input')].reduce((a, i) => a + num(i.value), 0);
      const ing = ingresoPersonalMes();
      const min = suma(S.deudas.filter(d => ambitoDe(d) === 'personal' && d.saldo > 0), d => d.minimo);
      const queda = ing - t - min;
      tot.innerHTML = `Presupuesto: <b>${dinero(t)}</b> + mínimos de deudas ${dinero(min)} → te quedan <b class="${queda < 0 ? 'rojo' : 'verde'}">${dinero(queda)}</b> al mes${queda < 0 ? '. No alcanza: baja algunas categorías o busca más ingresos.' : ' para ahorrar o pagar más deuda.'}`;
    };
    document.querySelectorAll('.presu-guia input').forEach(i => i.addEventListener('input', calc));
    calc();
  }
}

function leerFilasGuia() {
  return [...document.querySelectorAll('#filasGuia .fila-guia')].map(f => {
    const o = {};
    f.querySelectorAll('[data-campo]').forEach(el => { o[el.dataset.campo] = el.value.trim(); });
    return o;
  });
}

function guardarPasoGuia(clave) {
  const filas = clave === 'presupuesto' ? [] : leerFilasGuia();
  const dia = v => Math.max(0, Math.min(31, Math.round(num(v)) || 0));
  if (clave === 'ingresos') filas.filter(f => num(f.monto) > 0).forEach(f => S.fijos.push({
    id: uid(), tipo: 'ingreso', nombre: f.nombre || f.cat, monto: r2(num(f.monto)), cat: f.cat || 'Salario', dia: dia(f.dia), cuenta: '', ambito: f.ambito || 'personal'
  }));
  if (clave === 'fijos') filas.filter(f => num(f.monto) > 0).forEach(f => S.fijos.push({
    id: uid(), tipo: 'gasto', nombre: f.nombre || nombreCat(f.cat), monto: r2(num(f.monto)), cat: f.cat || 'Otros', dia: dia(f.dia), cuenta: '', ambito: 'personal'
  }));
  if (clave === 'deudas') {
    filas.filter(f => num(f.saldo) > 0).forEach(f => S.deudas.push({
      id: uid(), nombre: f.nombre || 'Deuda', tipo: 'Tarjeta', ultimos4: '', saldo: r2(num(f.saldo)), saldoInicial: r2(num(f.saldo)),
      apr: r2(num(f.apr)), minimo: r2(num(f.minimo)), limite: r2(num(f.limite)), dia: dia(f.dia), ambito: f.ambito || 'personal', deNegocio: 0
    }));
    const sin = $('#sinDeudasGuia');
    S.perfil.sinDeudas = !!(sin && sin.checked && !S.deudas.length);
  }
  if (clave === 'dinero') filas.filter(f => num(f.saldo) > 0).forEach(f => S.cuentas.push({
    id: uid(), nombre: f.nombre || f.tipo, tipo: f.tipo || 'Banco', ultimos4: '', saldo: r2(num(f.saldo)), ambito: f.ambito || 'personal',
    actualizada: hoy(), historial: [{ fecha: hoy(), saldo: r2(num(f.saldo)) }]
  }));
  if (clave === 'presupuesto') {
    const p = {};
    document.querySelectorAll('.presu-guia input').forEach(i => { const v = r2(num(i.value)); if (v > 0) p[i.dataset.cat] = v; });
    if (Object.keys(p).length) S.presupuesto = p;
  }
  guardar();
}

ACC.guiaFila = () => { if (plantillaFila) $('#filasGuia').insertAdjacentHTML('beforeend', plantillaFila); };
ACC.guiaQuitar = (id, b) => b.closest('.fila-guia').remove();
ACC.guiaSiguiente = () => { const n = S.perfil.guiaPaso || 1; guardarPasoGuia(PASOS_GUIA[n - 1].clave); abrirGuia(n + 1); };
ACC.guiaAtras = () => abrirGuia(Math.max(1, (S.perfil.guiaPaso || 1) - 1));
ACC.guiaSaltar = () => {
  const n = S.perfil.guiaPaso || 1;
  S.perfil.guiaSaltados = { ...(S.perfil.guiaSaltados || {}), [PASOS_GUIA[n - 1].clave]: hoy() };
  abrirGuia(n + 1);
};
ACC.guiaCerrar = () => { cerrarHoja(); pintar(); };
ACC.guiaPaso = id => abrirGuia(Number(id) || 1);

function resumenGuia() {
  S.perfil.guiaHecha = hoy(); S.perfil.guiaPaso = 0; guardar();
  unaVez('guia-completada');
  const s = saludFinanciera();
  const malos = s.factores.filter(f => !f.ok).slice(0, 3);
  const plan = S.deudas.some(d => d.saldo > 0) ? simular(S.perfil.metodo || 'avalancha', 0, S.deudas.filter(d => ambitoDe(d) === 'personal')) : null;
  const ingreso = ingresoPersonalMes();
  const comprometido = presupuestoTotal() + suma(S.deudas.filter(d => ambitoDe(d) === 'personal' && d.saldo > 0), d => d.minimo);
  hoja(`${cabecera('🎉 ¡Tu mapa está listo!')}
    <div class="cuerpo" style="display:flex;align-items:center;gap:14px;margin-top:6px">
      ${anillo(s.nota / 100, `<b class="${s.color}">${s.nota}</b><small>de 100</small>`, s.nota < 50)}
      <div><span class="chico muted">Salud financiera de tu casa</span><p class="grande ${s.color}" style="font-size:26px">${esc(s.nivel)}</p></div>
    </div>
    ${ingreso ? `<p class="chico">Entra <b>${dinero(ingreso)}</b> al mes y ya tienes comprometidos <b>${dinero(comprometido)}</b> (presupuesto + mínimos). ${ingreso - comprometido >= 0 ? `Te quedan <b class="verde">${dinero(ingreso - comprometido)}</b>.` : `Te faltan <b class="rojo">${dinero(comprometido - ingreso)}</b> cada mes.`}</p>` : ''}
    ${malos.length ? `<h2 style="margin-top:12px">Lo que más afecta tu casa</h2><ul class="consejos">${malos.map(f => `<li>⚠ ${esc(f.texto)}</li>`).join('')}</ul>` : ''}
    ${plan && plan.pagado ? `<p class="chico">Pagando solo los mínimos sales de tus deudas en <b>${plan.meses} meses</b> y pagas <b>${dinero(plan.interes)}</b> en intereses. En <b>Deudas</b> puedes poner un extra al mes y ver cuánto te ahorras.</p>` : plan ? `<p class="chico rojo">Con solo los mínimos tus deudas no bajan: los intereses se comen el pago. Revisa tu plan de salida en <b>Deudas</b>.</p>` : ''}
    <h2 style="margin-top:12px">Tu primer paso esta semana</h2>
    <p class="chico">${S.deudas.some(d => d.saldo > 0) ? '📅 Agrega tus fechas de pago al Calendario para no pagar nunca más un cargo por atraso.' : '🐖 Crea tu fondo de emergencia en Ahorros y haz tu primer aporte, aunque sea pequeño.'} Y registra cada gasto con el botón +.</p>
    <div class="botones">
      ${S.deudas.some(d => d.saldo > 0) ? '<button class="btn" data-a="calendario">📅 Calendario de pagos</button>' : ''}
      <button class="btn principal" data-a="guiaCerrar">Ir a mi Inicio</button>
    </div>`);
}

/* Tarjeta en Inicio mientras la configuración esté incompleta */
function tarjetaConfigurar() {
  if (!S.perfil.inicio || S.perfil.guiaOculta) return '';
  const items = PASOS_GUIA.map(p => ({ ...p, listo: pasoListo[p.clave]() }));
  const hechos = items.filter(i => i.listo).length;
  if (hechos === items.length) return '';
  const siguiente = items.find(i => !i.listo);
  return `<div class="card semaforo blue">
    <div class="fila"><h2 style="margin:0">🚀 Configura tu app</h2><b>${hechos} de ${items.length}</b></div>
    <div class="barra azul"><i style="width:${pct(hechos, items.length)}%"></i></div>
    <ul class="pasos">${items.map(i => `<li class="${i.listo ? 'ok' : ''}"><button type="button" class="enlace" data-a="guiaPaso" data-id="${i.n}">${i.listo ? '✓' : '○'} ${i.icono} ${esc(i.titulo)}</button></li>`).join('')}</ul>
    <div class="botones">
      <button class="btn chico principal" data-a="guiaPaso" data-id="${siguiente.n}">Continuar: paso ${siguiente.n}</button>
      <button class="btn chico" data-a="guiaOcultar">Ocultar</button>
    </div>
  </div>`;
}
ACC.guiaOcultar = () => { S.perfil.guiaOculta = true; guardar(); pintar(); aviso('Puedes volver a la guía desde ☰ → Bienvenida guiada'); };

/************************************************************
 * BLOQUEO: PIN + FACE ID / HUELLA
 * - El PIN se guarda cifrado (SHA-256 con sal), nunca en texto.
 * - Face ID usa el autenticador del propio teléfono (WebAuthn).
 * - La configuración vive aparte de tus datos: un respaldo nunca
 *   te deja fuera en otro teléfono.
 * Protege el acceso a la app; no cifra los datos guardados.
 ************************************************************/

const CLAVE_LOCK = 'cff.lock';
const leerLock = () => { try { return JSON.parse(localStorage.getItem(CLAVE_LOCK) || 'null') || {}; } catch (e) { return {}; } };
const guardarLock = l => { try { localStorage.setItem(CLAVE_LOCK, JSON.stringify(l)); } catch (e) { /* sin almacenamiento */ } };
const bloqueoActivo = () => !!leerLock().pin;

async function cifrarPin(pin, sal) {
  const datos = new TextEncoder().encode(sal + ':' + pin);
  const h = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function bioDisponible() {
  try {
    return !!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch (e) { return false; }
}
const aB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));

async function registrarBio() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'Mi Control' },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'mi-control', displayName: S.perfil.nombre || 'Mi Control' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000, attestation: 'none'
  } });
  return aB64(cred.rawId);
}

async function verificarBio(id) {
  const r = await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ type: 'public-key', id: deB64(id), transports: ['internal'] }],
    userVerification: 'required', timeout: 60000
  } });
  return !!r;
}

/* Teclado numérico reutilizable (pantalla de bloqueo y ajustes) */
function htmlTeclado(largo, conBio) {
  const tecla = (t, extra = '') => `<button type="button" class="tecla ${extra}" data-tecla="${t}">${t === 'borrar' ? '⌫' : t === 'bio' ? '🙂<small>Face ID</small>' : t}</button>`;
  return `<div class="puntos-pin">${Array.from({ length: largo }, () => '<i></i>').join('')}</div>
    <div class="teclado">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => tecla(n)).join('')}
      ${conBio ? tecla('bio', 'bio') : '<span></span>'}${tecla(0)}${tecla('borrar', 'borrar')}</div>`;
}

function activarTeclado(raiz, largo, alCompletar, alBio) {
  let pin = '';
  const pintarPuntos = () => raiz.querySelectorAll('.puntos-pin i').forEach((i, k) => i.classList.toggle('lleno', k < pin.length));
  raiz.addEventListener('click', async e => {
    const b = e.target.closest('[data-tecla]');
    if (!b) return;
    const t = b.dataset.tecla;
    if (t === 'bio') { if (alBio) alBio(); return; }
    if (t === 'borrar') pin = pin.slice(0, -1);
    else if (pin.length < largo) pin += t;
    pintarPuntos();
    if (pin.length === largo) {
      const ok = await alCompletar(pin);
      if (!ok) {
        const p = raiz.querySelector('.puntos-pin');
        p.classList.add('error'); setTimeout(() => p.classList.remove('error'), 450);
      }
      pin = ''; setTimeout(pintarPuntos, 120);
    }
  });
}

/* ---------- Pantalla de bloqueo ---------- */

let candadoAbierto = false;

async function mostrarCandado() {
  const l = leerLock();
  if (!l.pin || candadoAbierto) return;
  candadoAbierto = true;
  const conBio = !!l.bio && await bioDisponible();
  let div = $('#candado');
  if (!div) { div = document.createElement('div'); div.id = 'candado'; document.body.appendChild(div); }
  div.innerHTML = `<div class="caja-candado">
    <p class="hola"><b>${esc(saludo())}${primerNombre() ? ', ' + esc(primerNombre()) : ''}</b></p>
    <h1>🔒 Mi Control</h1>
    <p class="chico muted" id="msgCandado">Escribe tu PIN${conBio ? ' o usa Face ID' : ''}</p>
    ${htmlTeclado(l.largo || 4, conBio)}
    <button type="button" class="enlace chico muted" id="olvidePin" style="margin-top:18px">Olvidé mi PIN</button>
  </div>`;
  div.hidden = false;
  document.body.classList.add('bloqueada');
  const desbloquear = () => {
    div.hidden = true; candadoAbierto = false;
    document.body.classList.remove('bloqueada');
    guardarLock({ ...leerLock(), fallos: 0 });
  };
  const usarBio = async () => {
    try { if (await verificarBio(l.bio)) desbloquear(); }
    catch (e) { $('#msgCandado').textContent = 'No se pudo usar Face ID. Escribe tu PIN.'; }
  };
  activarTeclado(div, l.largo || 4, async pin => {
    const lk = leerLock();
    if (lk.espera && Date.now() < lk.espera) {
      $('#msgCandado').textContent = 'Demasiados intentos. Espera ' + Math.ceil((lk.espera - Date.now()) / 1000) + ' segundos.';
      return false;
    }
    if (await cifrarPin(pin, lk.sal) === lk.pin) { desbloquear(); return true; }
    const fallos = (lk.fallos || 0) + 1;
    guardarLock({ ...lk, fallos, espera: fallos >= 5 ? Date.now() + 30000 * (fallos - 4) : 0 });
    $('#msgCandado').textContent = fallos >= 5 ? 'PIN incorrecto. Espera ' + (30 * (fallos - 4)) + ' segundos.' : 'PIN incorrecto (' + fallos + ' de 5).';
    return false;
  }, usarBio);
  $('#olvidePin').addEventListener('click', () => {
    $('#msgCandado').innerHTML = 'Sin internet ni servidor, nadie puede ver ni recuperar tu PIN. Para entrar, borra los datos de este teléfono y recupera tu última copia (☰ → Recuperar copia). <button type="button" class="btn chico peligro" id="borrarPorPin" style="margin-top:10px">Borrar datos de este teléfono</button>';
    let conf = false;
    $('#borrarPorPin').addEventListener('click', e => {
      if (!conf) { conf = true; e.target.textContent = 'Se borra todo. Toca otra vez para confirmar'; return; }
      localStorage.removeItem(CLAVE); localStorage.removeItem(CLAVE_LOCK);
      fotosBorrarTodas(); location.reload();
    });
  });
}

/* Bloqueo al volver a la app y pantalla difuminada en el selector de apps */
let ocultaDesde = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    ocultaDesde = Date.now();
    if (bloqueoActivo()) document.body.classList.add('tapada');
  } else {
    document.body.classList.remove('tapada');
    const l = leerLock();
    if (l.pin && Date.now() - ocultaDesde >= (l.tras ?? 60) * 1000) mostrarCandado();
  }
});

/* ---------- Ajustes de seguridad ---------- */

function filasSeguridad() {
  const l = leerLock();
  if (!l.pin) return filaAjuste({ a: 'crearPin', ic: 'escudo', titulo: 'Bloquear con PIN y Face ID', sub: 'Nadie entra a tus finanzas sin tu permiso' });
  return [
    filaAjuste({ a: 'crearPin', ic: 'escudo', color: 'verde', titulo: 'Cambiar PIN', sub: 'Bloqueo activado · ' + (l.largo || 4) + ' dígitos' }),
    filaAjuste({ a: 'alternarBio', ic: 'persona', titulo: l.bio ? 'Face ID / huella: activado' : 'Activar Face ID / huella', sub: l.bio ? 'Toca para desactivar' : 'Entra con tu cara o tu huella' }),
    filaAjuste({ a: 'tiempoBloqueo', ic: 'calendario', titulo: 'Bloquear al salir', sub: ({ 0: 'De inmediato', 60: 'Después de 1 minuto', 300: 'Después de 5 minutos' })[l.tras ?? 60] }),
    filaAjuste({ a: 'quitarPin', ic: 'borrar', color: 'rojo', titulo: 'Quitar el bloqueo', sub: 'Te pedirá tu PIN' })
  ].join('');
}

ACC.crearPin = () => {
  let largo = 4, primero = '';
  const pintar = paso => {
    hoja(`${cabecera(paso === 1 ? 'Crea tu PIN' : 'Confírmalo')}
      <p class="ayuda">${paso === 1 ? 'Elige un PIN que recuerdes y que no sea tu fecha de nacimiento. No se puede recuperar: si lo olvidas tendrás que restaurar una copia.' : 'Escríbelo otra vez.'}</p>
      ${paso === 1 ? `<div class="segmento" style="margin-top:10px"><button type="button" data-largo="4" class="${largo === 4 ? 'activo' : ''}">4 dígitos</button><button type="button" data-largo="6" class="${largo === 6 ? 'activo' : ''}">6 dígitos</button></div>` : ''}
      <div id="tecladoPin" class="centro" style="margin-top:14px">${htmlTeclado(largo, false)}</div>`);
    document.querySelectorAll('[data-largo]').forEach(b => b.addEventListener('click', () => { largo = Number(b.dataset.largo); pintar(1); }));
    activarTeclado($('#tecladoPin'), largo, async pin => {
      if (paso === 1) { primero = pin; setTimeout(() => pintar(2), 150); return true; }
      if (pin !== primero) { aviso('No coinciden. Empieza de nuevo.'); setTimeout(() => pintar(1), 300); return false; }
      const sal = aB64(crypto.getRandomValues(new Uint8Array(16)));
      const l = leerLock();
      guardarLock({ ...l, pin: await cifrarPin(pin, sal), sal, largo, fallos: 0, tras: l.tras ?? 60 });
      cerrarHoja();
      aviso('🔒 Bloqueo activado');
      unaVez('bloqueo-activado');
      if (!l.bio && await bioDisponible()) setTimeout(ofrecerBio, 400); else abrirAjustes();
      return true;
    });
  };
  pintar(1);
};

function ofrecerBio() {
  hoja(`${cabecera('¿Usar Face ID o huella?')}
    <p class="ayuda">Así entras sin escribir el PIN. El PIN sigue funcionando como respaldo.</p>
    <div class="botones"><button class="btn" data-a="cerrar">Ahora no</button><button class="btn principal" data-a="alternarBio">Activar Face ID</button></div>`);
}

ACC.alternarBio = async () => {
  const l = leerLock();
  if (l.bio) { guardarLock({ ...l, bio: '' }); aviso('Face ID desactivado'); abrirAjustes(); return; }
  try {
    const id = await registrarBio();
    guardarLock({ ...leerLock(), bio: id });
    aviso('🙂 Face ID activado');
  } catch (e) {
    aviso('Este teléfono no permitió activar Face ID. Puedes seguir usando tu PIN.');
  }
  abrirAjustes();
};

ACC.tiempoBloqueo = () => formulario({
  titulo: 'Bloquear al salir',
  campos: [{ n: 'tras', t: 'select', l: 'Pedir PIN cuando vuelvas después de…', ops: [['0', 'De inmediato'], ['60', '1 minuto'], ['300', '5 minutos']] }],
  valores: { tras: String(leerLock().tras ?? 60) },
  guardar: v => { guardarLock({ ...leerLock(), tras: Number(v.tras) }); }
});

ACC.quitarPin = () => {
  const l = leerLock();
  hoja(`${cabecera('Quitar el bloqueo')}<p class="ayuda">Escribe tu PIN actual.</p><div id="tecladoPin" class="centro">${htmlTeclado(l.largo || 4, false)}</div>`);
  activarTeclado($('#tecladoPin'), l.largo || 4, async pin => {
    if (await cifrarPin(pin, l.sal) !== l.pin) return false;
    localStorage.removeItem(CLAVE_LOCK);
    cerrarHoja(); aviso('Bloqueo quitado'); abrirAjustes();
    return true;
  });
};

/************************************************************
 * ESTADÍSTICAS ANÓNIMAS (GoatCounter)
 * Solo cuenta visitas y eventos de uso. Nunca envía nombres,
 * correos, montos, tarjetas ni ningún dato financiero.
 * Sin cookies. Se puede desactivar en ☰ → Seguridad.
 ************************************************************/

/* Código de la cuenta de GoatCounter (ej. 'controlfinanciero'). Vacío = desactivado. */
const GOATCOUNTER = 'controlfinanciero';

const estadisticasActivas = () => !!GOATCOUNTER && S.perfil.estadisticas !== false && location.protocol === 'https:';

function cargarEstadisticas() {
  if (!estadisticasActivas() || window.goatcounter && window.goatcounter.count) return;
  window.goatcounter = { no_onload: true, allow_local: false };
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = 'https://' + GOATCOUNTER + '.goatcounter.com/count';
  s.onload = () => {
    /* Una "visita" por apertura; la ruta no lleva datos: solo la pantalla y si está instalada */
    contar('/' + (enPantallaDeInicio() ? 'app' : 'web'));
    if (enPantallaDeInicio()) unaVez('instalada');
  };
  document.head.appendChild(s);
}

function contar(ruta, evento) {
  try {
    if (!estadisticasActivas() || !window.goatcounter || !window.goatcounter.count) return;
    window.goatcounter.count({ path: ruta, title: ruta, event: !!evento });
  } catch (e) { /* las estadísticas nunca afectan la app */ }
}

/* Eventos que se cuentan una sola vez por teléfono */
function unaVez(nombre) {
  try {
    const k = 'cff.evento.' + nombre;
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, hoy());
    contar('evento/' + nombre, true);
  } catch (e) { /* sin almacenamiento */ }
}

ACC.alternarEstadisticas = () => {
  S.perfil.estadisticas = S.perfil.estadisticas === false;
  guardar();
  aviso(S.perfil.estadisticas ? 'Estadísticas anónimas activadas. ¡Gracias!' : 'Estadísticas desactivadas');
  if (S.perfil.estadisticas) cargarEstadisticas();
  abrirAjustes();
};

/************************************************************
 * PERSONAL | NEGOCIO | TODO
 ************************************************************/

const etiquetaVista = () => ({ todo: 'Todo', personal: 'Personal', negocio: nombreNegocio() })[vistaElegida()];

/* Parte del saldo de deudas personales que en realidad son gastos del negocio */
const deNegocioTotal = () => suma(
  S.deudas.filter(d => ambitoDe(d) === 'personal'),
  d => Math.min(d.deNegocio || 0, Math.max(0, d.saldo))
);

function selectorVista() {
  if (!conNegocio()) return '';
  const v = vistaElegida();
  return `
  <div class="segmento tres" style="margin-bottom:12px">
    <button data-a="vista" data-id="personal" class="${v === 'personal' ? 'activo' : ''}">🏠 Personal</button>
    <button data-a="vista" data-id="negocio" class="${v === 'negocio' ? 'activo' : ''}">🏢 Negocio</button>
    <button data-a="vista" data-id="todo" class="${v === 'todo' ? 'activo' : ''}">Todo</button>
  </div>`;
}

ACC.vista = id => { S.perfil.vista = id; guardar(); pintar(); };

/* Números de un ámbito, sin importar la vista elegida */
function cifras(ambito) {
  const deudas = S.deudas.filter(d => ambitoDe(d) === ambito);
  const abiertas = deudas.filter(d => d.saldo > 0);
  const fijos = S.fijos.filter(f => ambitoDe(f) === ambito);
  const limite = suma(deudas.filter(d => d.limite > 0), d => d.limite);
  const usado = suma(deudas.filter(d => d.limite > 0), d => d.saldo);
  const ingresos = suma(fijos.filter(f => f.tipo === 'ingreso'), f => f.monto);
  const gastosFijos = suma(fijos.filter(f => f.tipo === 'gasto'), f => f.monto);
  const minimos = suma(abiertas, d => d.minimo);
  return {
    deuda: suma(deudas, d => d.saldo),
    minimos,
    interesMes: suma(abiertas, d => d.saldo * (d.apr || 0) / 100 / 12),
    limite,
    uso: limite > 0 ? usado / limite * 100 : 0,
    tengo: suma(S.cuentas.filter(c => ambitoDe(c) === ambito), c => c.saldo),
    ingresos,
    gastosFijos,
    carga: ingresos > 0 ? minimos / ingresos * 100 : null,
    altas: deudas.filter(d => utilizacion(d) >= 80),
    utilidad: ambito === 'negocio' && pygPromedio() ? pygPromedio().utilidad : null,
    presupuesto: ambito === 'personal' ? presupuestoTotal() : 0
  };
}

function consejosPanorama(p, n) {
  const c = [];
  const neg = esc(nombreNegocio());
  const deNeg = deNegocioTotal();
  if (deNeg > 0) {
    c.push(`🔁 <b>${dinero(deNeg)}</b> de tu deuda personal (${Math.round(pct(deNeg, p.deuda))}%) son gastos de ${neg}. Ese dinero lo debería reponer el negocio: pide reembolso o pásalo a una tarjeta a nombre de ${neg}.`);
  }
  if (p.carga !== null && p.carga >= 40) {
    c.push(`⚠️ Tus pagos mínimos personales se llevan el <b>${Math.round(p.carga)}%</b> de tus ingresos fijos. Arriba del 40% cualquier imprevisto termina en atraso.`);
  } else if (p.carga === null && p.minimos > 0) {
    c.push('➕ Registra tu salario como <b>ingreso fijo personal</b> para saber qué parte de tus ingresos se va en mínimos.');
  }
  if (p.presupuesto && p.ingresos && p.presupuesto + p.minimos > p.ingresos) {
    c.push(`🏠 Gastos de la casa planeados (${dinero(p.presupuesto)}) + mínimos personales (${dinero(p.minimos)}) = <b>${dinero(p.presupuesto + p.minimos)}</b>, más que tus ingresos (${dinero(p.ingresos)}). Faltan <b>${dinero(p.presupuesto + p.minimos - p.ingresos)} al mes</b>.`);
  } else if (p.presupuesto && p.ingresos) {
    c.push(`🏠 Después de la casa y los mínimos te quedan <b>${dinero(p.ingresos - p.presupuesto - p.minimos)} al mes</b>. Ese es tu "extra" real para la vista Personal.`);
  }
  if (n.utilidad !== null) {
    if (n.utilidad <= 0) c.push(`🏢 Según el P&L, ${neg} <b>pierde ${dinero(-n.utilidad)} al mes</b> en promedio. Sus deudas las estás pagando con otro dinero.`);
    else if (n.utilidad < n.minimos) c.push(`🏢 La utilidad de ${neg} (${dinero(n.utilidad)} al mes) <b>no cubre</b> los mínimos de sus deudas (${dinero(n.minimos)}).`);
    else c.push(`🏢 ${neg} gana ${dinero(n.utilidad)} al mes y sus mínimos son ${dinero(n.minimos)}: le quedan <b>${dinero(n.utilidad - n.minimos)}</b> para bajar deuda.`);
  } else if (n.deuda > 0 && !n.ingresos) {
    c.push(`🏢 ${neg} tiene deudas pero no hay P&L ni ingresos registrados. Sube el P&L del negocio para saber si puede pagar lo suyo sin tocar tu dinero personal.`);
  } else if (n.carga !== null && n.carga >= 30) {
    c.push(`🏢 Los mínimos de ${neg} son el <b>${Math.round(n.carga)}%</b> de sus ingresos fijos.`);
  }
  const altas = [...p.altas, ...n.altas];
  if (altas.length) {
    c.push(`🔴 Usadas arriba del 80%: <b>${altas.map(d => esc(d.nombre)).join(', ')}</b>. No cargues nada nuevo ahí.`);
  }
  const interes = p.interesMes + n.interesMes;
  if (interes >= 100) {
    c.push(`💸 Entre las dos partes pagas cerca de <b>${dinero(Math.round(interes))}</b> al mes en intereses (≈ ${dinero(Math.round(interes / 30))} al día).`);
  }
  if (!c.length) c.push('✅ Personal y negocio están en orden. Mantén cada gasto en su lado.');
  return c;
}

function tarjetaPanorama() {
  if (!conNegocio()) return '';
  const p = cifras('personal');
  const n = cifras('negocio');
  const neg = esc(nombreNegocio());
  const fila = (t, a, b, rojoA, rojoB) =>
    `<tr><th>${t}</th><td class="${rojoA ? 'rojo' : ''}">${a}</td><td class="${rojoB ? 'rojo' : ''}">${b}</td></tr>`;
  const porc = x => x === null ? '—' : Math.round(x) + '%';
  return `
  <div class="card">
    <h2>Panorama: personal y negocio</h2>
    <table class="tabla">
      <thead><tr><th></th><th>🏠 Personal</th><th>🏢 ${neg}</th></tr></thead>
      <tbody>
        ${fila('Debes', dinero(p.deuda), dinero(n.deuda))}
        ${p.deuda > 0 && deNegocioTotal() > 0 ? fila('…de eso, gastos del negocio', dinero(deNegocioTotal()), '—', true) : ''}
        ${fila('Mínimos al mes', dinero(p.minimos), dinero(n.minimos))}
        ${fila('Intereses al mes (aprox.)', dinero(Math.round(p.interesMes)), dinero(Math.round(n.interesMes)))}
        ${fila('Uso del crédito', porc(p.limite ? p.uso : null), porc(n.limite ? n.uso : null), p.uso >= 50, n.uso >= 50)}
        ${fila('Dinero en cuentas', dinero(p.tengo), dinero(n.tengo))}
        ${fila('Ingresos fijos al mes', dinero(p.ingresos), dinero(n.ingresos))}
        ${fila('Gastos fijos al mes', dinero(p.gastosFijos), dinero(n.gastosFijos))}
        ${p.presupuesto || n.utilidad !== null ? fila('Casa (presupuesto) / Utilidad (P&L)', p.presupuesto ? dinero(p.presupuesto) : '—', n.utilidad !== null ? dinero(n.utilidad) : '—', false, n.utilidad !== null && n.utilidad < n.minimos) : ''}
        ${fila('Mínimos ÷ ingresos', porc(p.carga), porc(n.carga), p.carga >= 40, n.carga >= 30)}
      </tbody>
    </table>
    <h2 style="margin-top:16px">Para decidir</h2>
    <ul class="consejos">${consejosPanorama(p, n).map(t => `<li>${t}</li>`).join('')}</ul>
  </div>`;
}


/************************************************************
 * VISTA: DEUDAS
 ************************************************************/

function vistaDeudas() {
  const total = deudaTotal();
  const inicial = deudaInicial();
  const vista = vistaElegida();
  let h = selectorVista();

  if (vista === 'todo') h += tarjetaPanorama();

  if (!deudasV().length) {
    h += `
    <div class="card vacio">
      <span class="emo">💳</span>
      ${vista === 'negocio' ? 'No hay deudas del negocio registradas. Agrega las tarjetas y préstamos a nombre de ' + esc(nombreNegocio()) + '.'
        : vista === 'personal' ? 'No hay deudas personales registradas.'
        : S.perfil.sinDeudas ? 'Marcaste que no tienes deudas. ¡Bien!' : 'Agrega aquí cada tarjeta y préstamo para ver el total y tu plan de salida.'}
      <div class="botones">
        <button class="btn principal" data-a="nuevaDeuda">Agregar deuda</button>
        ${S.perfil.sinDeudas ? '' : '<button class="btn" data-a="sinDeudas">No tengo deudas</button>'}
      </div>
    </div>`;
    return h;
  }

  h += `
  <div class="card">
    <span class="muted chico">${vista === 'negocio' ? 'Debe ' + esc(nombreNegocio()) : vista === 'personal' ? 'Debes a tu nombre' : 'Debes en total'}</span>
    <p class="grande">${dinero(total)}</p>
    ${vista === 'personal' && deNegocioTotal() > 0 ? `
      <p class="chico" style="margin:0 0 6px">De esto, <b>${dinero(deNegocioTotal())}</b> son gastos del negocio. Deuda realmente personal: <b>${dinero(total - deNegocioTotal())}</b>.</p>` : ''}
    ${inicial > total ? `
      <div class="barra"><i style="width:${pct(inicial - total, inicial)}%"></i></div>
      <span class="chico muted">Has bajado ${dinero(inicial - total)} desde que empezaste (${dinero(inicial)}).</span>` : ''}
  </div>`;

  h += deudasV().map(d => {
    const u = utilizacion(d);
    const interesMes = r2(d.saldo * (d.apr || 0) / 100 / 12);
    return `
    <div class="card">
      <div class="fila">
        <h2 style="margin:0">${esc(d.nombre)} <small>· ${esc(d.tipo)}${d.ultimos4 ? ' •••• ' + esc(d.ultimos4) : ''}</small></h2>
        <b>${dinero(d.saldo)}</b>
      </div>
      ${conNegocio() ? `<p class="chico" style="margin:4px 0 0">
        <span class="etiqueta ${ambitoDe(d) === 'negocio' ? 'blue' : ''}">${ambitoDe(d) === 'negocio' ? '🏢 ' + esc(nombreNegocio()) : AMBITOS.personal}</span>
        ${ambitoDe(d) === 'personal' && d.deNegocio > 0 && d.saldo > 0 ? `<span class="etiqueta red">${dinero(Math.min(d.deNegocio, d.saldo))} son del negocio</span>` : ''}
      </p>` : ''}
      ${d.saldoInicial > 0 ? `<div class="barra"><i style="width:${pct(d.saldoInicial - d.saldo, d.saldoInicial)}%"></i></div>` : ''}
      <p class="chico muted" style="margin:6px 0 0">
        ${promoActiva(d) ? `<span class="etiqueta ${diasPromo(d) <= 90 ? 'red' : ''}">⏳ ${d.apr || 0}% hasta el ${esc(fechaCorta(d.promoFin))} · faltan ${diasPromo(d)} días${d.aprDespues ? ', luego ' + d.aprDespues + '% (≈ ' + dinero(r2(d.saldo * d.aprDespues / 1200)) + ' al mes)' : ''}</span><br>` : ''}
        ${d.apr ? 'Interés ' + d.apr + '% anual (≈ ' + dinero(interesMes) + ' al mes)' : 'Sin interés registrado'}
        · Mínimo ${dinero(d.minimo)}${d.dia ? ' · Paga el día ' + d.dia : ''}
        ${d.limite > 0 ? `<br>Usada al ${Math.round(u)}% de ${dinero(d.limite)} <span class="etiqueta ${u >= 50 ? 'red' : u >= 30 ? '' : 'green'}">${u >= 50 ? 'alta' : u >= 30 ? 'cuidado' : 'bien'}</span>` : ''}
      </p>
      <div class="botones">
        <button class="btn chico principal" data-a="pagar" data-id="${d.id}" ${d.saldo <= 0 ? 'disabled' : ''}>${d.saldo <= 0 ? 'Pagada 🎉' : 'Registrar pago'}</button>
        <button class="btn chico" data-a="editarDeuda" data-id="${d.id}">Editar</button>
      </div>
    </div>`;
  }).join('');

  h += `<div class="botones"><button class="btn" data-a="nuevaDeuda">+ Agregar deuda</button><button class="btn" data-a="calendario">📅 Pagos a mi Calendario</button></div>`;
  h += planSalida();
  return h;
}

function planSalida() {
  if (deudaTotal() <= 0) return '';
  const extra = S.perfil[claveExtra()] || 0;
  const av = simular('avalancha', extra);
  const bo = simular('bola', extra);
  if (!av) {
    return `<div class="card" style="margin-top:14px"><h2>Tu plan de salida</h2>
      <p class="muted chico">Agrega el pago mínimo de tus deudas para calcular en cuánto tiempo sales.</p></div>`;
  }
  const metodo = S.perfil.metodo || 'avalancha';
  const sim = metodo === 'bola' ? bo : av;
  const otra = metodo === 'bola' ? av : bo;

  let h = `
  <div class="card" style="margin-top:14px">
    <h2>Tu plan de salida${conNegocio() ? ' <small>· ' + esc(etiquetaVista()) + '</small>' : ''}</h2>
    <div class="segmento">
      <button data-a="metodo" data-id="avalancha" class="${metodo === 'avalancha' ? 'activo' : ''}">Avalancha</button>
      <button data-a="metodo" data-id="bola" class="${metodo === 'bola' ? 'activo' : ''}">Bola de nieve</button>
    </div>
    <p class="ayuda">${metodo === 'bola'
      ? 'Pagas primero la deuda más pequeña. Ves resultados rápido y eso motiva.'
      : 'Pagas primero la de interés más alto. Es la que menos intereses te cuesta.'}</p>
    <div class="fila" style="margin-top:12px">
      <span class="chico muted">Extra cada mes, además de los mínimos</span>
      <button class="btn chico" data-a="cambiarExtra">${dinero(extra)} ✎</button>
    </div>`;

  if (!sim.pagado) {
    h += `<p class="rojo" style="margin:14px 0 0"><b>Con ${dinero(sim.presupuesto)} al mes la deuda no baja:</b> los intereses se comen el pago. Sube el extra para ver una fecha de salida.</p>`;
  } else {
    h += `
    <div class="cuatro">
      <div class="dato"><span>Sales en</span><b>${sim.meses} ${sim.meses === 1 ? 'mes' : 'meses'}</b></div>
      <div class="dato"><span>Fecha estimada</span><b>${esc(sim.fecha)}</b></div>
      <div class="dato"><span>Pagas al mes</span><b>${dinero(sim.presupuesto)}</b></div>
      <div class="dato"><span>Intereses totales</span><b>${dinero(sim.interes)}</b></div>
    </div>`;
    if (otra.pagado && Math.abs(otra.interes - sim.interes) >= 1) {
      const dif = otra.interes - sim.interes;
      h += `<p class="ayuda">${dif > 0
        ? 'Con este método pagas ' + dinero(dif) + ' menos en intereses que con el otro.'
        : 'El otro método te ahorraría ' + dinero(-dif) + ' en intereses.'}</p>`;
    }
    h += `<h2 style="margin-top:16px">Orden en que las terminas</h2><ul class="lista">` +
      sim.orden.map((d, i) => `
        <li><span class="punto">${i + 1}</span>
          <span class="txt"><b>${esc(d.nombre)}</b><span>Mes ${d.mes}</span></span></li>`).join('') +
      `</ul>`;
  }
  h += `<p class="ayuda">Es una estimación con los datos que registraste, no una promesa. Los intereses reales los define tu banco.</p></div>`;
  return h;
}

ACC.nuevaDeuda = () => formDeuda();
ACC.editarDeuda = id => formDeuda(S.deudas.find(d => d.id === id));
ACC.pagar = id => formPago(S.deudas.find(d => d.id === id));
ACC.sinDeudas = () => { S.perfil.sinDeudas = true; guardar(); pintar(); };
ACC.metodo = id => { S.perfil.metodo = id; guardar(); pintar(); };
ACC.cambiarExtra = () => formulario({
  titulo: 'Extra cada mes',
  ayuda: '¿Cuánto puedes poner cada mes por encima de los pagos mínimos?' +
    (conNegocio() ? ' Este monto es solo para la vista ' + etiquetaVista() + '.' : ''),
  campos: [{ n: 'extra', t: 'dinero', l: 'Monto extra' }],
  valores: { extra: S.perfil[claveExtra()] || '' },
  guardar: v => { S.perfil[claveExtra()] = v.extra; }
});

function formDeuda(d) {
  formulario({
    titulo: d ? 'Editar deuda' : 'Nueva deuda',
    campos: [
      { n: 'nombre', t: 'texto', l: 'Nombre', req: true, ph: 'Ej. Tarjeta del banco' },
      { n: 'tipo', t: 'select', l: 'Tipo', ops: ['Tarjeta', 'Préstamo', 'Carro', 'Casa', 'Familiar', 'Otra'] },
      { n: 'ultimos4', t: 'ultimos4', l: 'Últimos 4 números (opcional)' },
      { n: 'saldo', t: 'dinero', l: '¿Cuánto debes hoy?', req: true },
      { n: 'apr', t: 'numero', l: 'Interés anual % (APR)', ph: 'Ej. 24.99' },
      { n: 'promoFin', t: 'fechaFutura', l: 'Si tiene promoción (ej. 0%): ¿cuándo termina?' },
      { n: 'aprDespues', t: 'numero', l: 'Interés % cuando termine la promoción', ph: 'Ej. 22.99' },
      { n: 'minimo', t: 'dinero', l: 'Pago mínimo al mes' },
      { n: 'limite', t: 'dinero', l: 'Límite de crédito (solo tarjetas)' },
      { n: 'dia', t: 'numero', l: 'Día del mes en que pagas', ph: '1 a 31' },
      ...campoAmbito(),
      ...(conNegocio() ? [{ n: 'deNegocio', t: 'dinero', l: 'Si es personal: ¿cuánto de este saldo son gastos del negocio?' }] : [])
    ],
    valores: d || { tipo: 'Tarjeta', ambito: ambitoPorDefecto() },
    borrar: d ? () => { S.deudas = S.deudas.filter(x => x.id !== d.id); } : null,
    guardar: v => {
      v.dia = Math.max(0, Math.min(31, Math.round(v.dia)));
      if ('deNegocio' in v) v.deNegocio = v.ambito === 'negocio' ? 0 : Math.min(v.deNegocio, v.saldo);
      if (!v.promoFin) v.aprDespues = 0;
      if (d) {
        Object.assign(d, v);
        if (v.saldo > d.saldoInicial) d.saldoInicial = v.saldo;
      } else {
        S.deudas.push({ id: uid(), ...v, saldoInicial: v.saldo });
        S.perfil.sinDeudas = false;
      }
    }
  });
}

function formPago(d) {
  if (!d) return;
  formulario({
    titulo: 'Pago a ' + d.nombre,
    ayuda: 'Debes ' + dinero(d.saldo) + (d.minimo ? ' · mínimo ' + dinero(d.minimo) : ''),
    campos: [
      { n: 'monto', t: 'dinero', l: '¿Cuánto pagaste?', req: true },
      { n: 'fecha', t: 'fecha', l: 'Fecha' },
      ...campoCuenta('¿De dónde salió?')
    ],
    valores: { fecha: hoy(), cuenta: cuentaPorDefecto() },
    texto: 'Registrar pago',
    guardar: v => {
      const monto = Math.min(v.monto, d.saldo);
      d.saldo = r2(d.saldo - monto);
      moverCuenta(v.cuenta, -monto);
      if (v.cuenta) S.perfil.ultimaCuenta = v.cuenta;
      S.pagos.push({ id: uid(), deudaId: d.id, nombre: d.nombre, monto, fecha: v.fecha || hoy(), cuenta: v.cuenta || '' });
      aviso(d.saldo <= 0 ? '🎉 ¡Deuda pagada!' : 'Pago registrado');
    }
  });
}

function elegirDeudaParaPago() {
  const abiertas = deudasV().filter(d => d.saldo > 0);
  if (!abiertas.length) { cerrarHoja(); ir('deudas'); aviso('Primero agrega una deuda'); return; }
  if (abiertas.length === 1) return formPago(abiertas[0]);
  hoja(cabecera('¿A cuál deuda pagaste?') + `<ul class="lista">` + abiertas.map(d => `
    <li><button class="fila-btn" data-a="pagar" data-id="${d.id}">
      <span class="punto">💳</span><span class="txt"><b>${esc(d.nombre)}</b><span>Debes ${dinero(d.saldo)}</span></span>
    </button></li>`).join('') + `</ul>`);
}


/************************************************************
 * VISTA: AHORROS
 ************************************************************/

function vistaAhorros() {
  if (!S.metas.length) {
    return `
    <div class="card vacio">
      <span class="emo">🏦</span>
      Crea tu primera meta. Un buen comienzo es un fondo de protección para imprevistos.
      <div class="botones"><button class="btn principal" data-a="nuevaMeta">Crear meta de ahorro</button></div>
    </div>`;
  }
  let h = `
  <div class="card">
    <span class="muted chico">Tienes ahorrado</span>
    <p class="grande verde">${dinero(ahorroTotal())}</p>
  </div>`;

  h += S.metas.map(m => {
    const falta = Math.max(0, m.meta - m.actual);
    return `
    <div class="card">
      <div class="fila"><h2 style="margin:0">${esc(m.nombre)}</h2><b>${Math.round(pct(m.actual, m.meta))}%</b></div>
      <div class="barra"><i style="width:${pct(m.actual, m.meta)}%"></i></div>
      <p class="chico muted" style="margin:0">${dinero(m.actual)} de ${dinero(m.meta)}${falta ? ' · faltan ' + dinero(falta) : ' · ¡meta cumplida! 🎉'}</p>
      <div class="botones">
        <button class="btn chico principal" data-a="aportar" data-id="${m.id}">Aportar</button>
        <button class="btn chico" data-a="editarMeta" data-id="${m.id}">Editar</button>
      </div>
    </div>`;
  }).join('');

  h += `<button class="btn ancho" data-a="nuevaMeta">+ Crear otra meta</button>`;
  return h;
}

ACC.nuevaMeta = () => formMeta();
ACC.editarMeta = id => formMeta(S.metas.find(m => m.id === id));
ACC.aportar = id => formAporte(S.metas.find(m => m.id === id));

function formMeta(m) {
  formulario({
    titulo: m ? 'Editar meta' : 'Nueva meta de ahorro',
    campos: [
      { n: 'nombre', t: 'texto', l: '¿Para qué ahorras?', req: true, ph: 'Ej. Fondo de protección' },
      { n: 'meta', t: 'dinero', l: '¿Cuánto quieres juntar?', req: true },
      { n: 'actual', t: 'dinero', l: '¿Cuánto tienes ya?' }
    ],
    valores: m || {},
    borrar: m ? () => { S.metas = S.metas.filter(x => x.id !== m.id); } : null,
    guardar: v => {
      if (m) Object.assign(m, v);
      else S.metas.push({ id: uid(), ...v });
    }
  });
}

function formAporte(m) {
  if (!m) return;
  formulario({
    titulo: 'Aporte a ' + m.nombre,
    ayuda: 'Llevas ' + dinero(m.actual) + ' de ' + dinero(m.meta),
    campos: [
      { n: 'monto', t: 'dinero', l: '¿Cuánto apartaste?', req: true },
      { n: 'fecha', t: 'fecha', l: 'Fecha' }
    ],
    valores: { fecha: hoy() },
    texto: 'Registrar aporte',
    guardar: v => {
      m.actual = r2(m.actual + v.monto);
      S.aportes.push({ id: uid(), metaId: m.id, nombre: m.nombre, monto: v.monto, fecha: v.fecha || hoy() });
      aviso(m.actual >= m.meta ? '🎉 ¡Meta cumplida!' : 'Aporte registrado');
    }
  });
}

function elegirMetaParaAporte() {
  if (!S.metas.length) { cerrarHoja(); ir('ahorros'); aviso('Primero crea una meta'); return; }
  if (S.metas.length === 1) return formAporte(S.metas[0]);
  hoja(cabecera('¿A cuál meta aportaste?') + `<ul class="lista">` + S.metas.map(m => `
    <li><button class="fila-btn" data-a="aportar" data-id="${m.id}">
      <span class="punto">🏦</span><span class="txt"><b>${esc(m.nombre)}</b><span>${dinero(m.actual)} de ${dinero(m.meta)}</span></span>
    </button></li>`).join('') + `</ul>`);
}


/************************************************************
 * VISTA: RETOS Y CHECK-IN SEMANAL
 ************************************************************/

function vistaRetos() {
  const p = programa();
  const cumplidos = RETOS.filter(r => S.retos[r.n]).length;

  let h = `
  <div class="card">
    <div class="fila"><span class="muted chico">Día ${p.dia} de ${DIAS_PROGRAMA} · Semana ${p.semana}</span><b>${cumplidos} de ${SEMANAS}</b></div>
    <div class="barra"><i style="width:${pct(cumplidos, SEMANAS)}%"></i></div>
    <span class="chico muted">Un reto por semana. Los cumples tú; nadie los marca por ti.</span>
  </div>`;

  h += tarjetaCheckin(p.semana);

  let etapa = '';
  RETOS.forEach(r => {
    if (r.etapa !== etapa) {
      etapa = r.etapa;
      h += `<p class="etapa">${etapa}</p>`;
    }
    const hecho = S.retos[r.n];
    const futuro = r.n > p.semana;
    const actual = r.n === p.semana && !hecho;
    const [val, meta] = r.auto ? r.auto(rangoSemana(r.n)) : [0, 0];
    const listo = !r.auto || val >= meta;
    const rango = rangoSemana(r.n);

    h += `
    <div class="card reto ${hecho ? 'hecho' : actual ? 'actual' : futuro ? 'futuro' : ''}">
      <span class="num">Semana ${r.n} · ${esc(fechaCorta(rango[0]))} – ${esc(fechaCorta(rango[1]))}${actual ? ' · esta semana' : ''}</span>
      <h3>${hecho ? '✅ ' : futuro ? '🔒 ' : ''}${esc(r.titulo)}</h3>
      <p>${esc(r.texto)}</p>`;

    if (r.n === 13 && !futuro) h += fotoDia90();

    if (hecho) {
      h += `<div class="fila" style="margin-top:10px"><span class="chico verde"><b>Cumplido el ${esc(fechaCorta(hecho))}</b></span>
        <button class="btn chico" data-a="desmarcarReto" data-id="${r.n}">Desmarcar</button></div>`;
    } else if (!futuro) {
      if (r.auto && meta > 1) {
        h += `<div class="barra"><i style="width:${pct(val, meta)}%"></i></div><span class="chico muted">Llevas ${Math.min(val, meta)} de ${meta}</span>`;
      }
      h += `<div class="botones">`;
      if (r.accion && !listo) h += `<button class="btn chico oscuro" data-a="accionReto" data-id="${r.n}">${esc(r.accion[0])}</button>`;
      h += `<button class="btn chico principal" data-a="cumplirReto" data-id="${r.n}" ${listo ? '' : 'disabled'}>Lo cumplí</button></div>`;
    }
    h += `</div>`;
  });

  h += `<p class="legal">Los retos son ejercicios educativos de hábitos. No garantizan resultados ni sustituyen la asesoría de un profesional.</p>`;
  return h;
}

function tarjetaCheckin(semana) {
  const t = deLaSemana(semana);
  const c = S.checkins[semana];
  return `
  <div class="card">
    <h2>Check-in de la semana ${semana}</h2>
    <div class="cuatro" style="margin-top:0">
      <div class="dato"><span>Entró</span><b class="verde">${dinero(t.ingresos)}</b></div>
      <div class="dato"><span>Salió</span><b>${dinero(t.gastos)}</b></div>
      <div class="dato"><span>A deudas</span><b>${dinero(t.pagos)}</b></div>
      <div class="dato"><span>Al ahorro</span><b>${dinero(t.aportes)}</b></div>
    </div>
    ${c ? `
      <p class="chico" style="margin:12px 0 0"><span class="muted">Lo que me frenó:</span> ${esc(c.freno || '—')}</p>
      <p class="chico" style="margin:4px 0 0"><span class="muted">Lo que corrijo:</span> ${esc(c.corrijo || '—')}</p>` : `
      <p class="chico muted" style="margin:12px 0 0">Dos preguntas, dos minutos. Hazlo una vez por semana.</p>`}
    <div class="botones">
      <button class="btn chico ${c ? '' : 'principal'}" data-a="checkin" data-id="${semana}">${c ? 'Editar check-in' : 'Hacer mi check-in'}</button>
      <button class="btn chico" data-a="enviarAvance">📤 Enviar mi avance</button>
    </div>
  </div>`;
}

ACC.checkin = id => {
  const semana = Number(id);
  formulario({
    titulo: 'Check-in de la semana ' + semana,
    campos: [
      { n: 'freno', t: 'parrafo', l: '¿Qué me frenó esta semana?', ph: 'Ej. Gasté de más el fin de semana' },
      { n: 'corrijo', t: 'parrafo', l: '¿Qué corrijo la próxima semana?', ph: 'Ej. Llevo comida al trabajo' }
    ],
    valores: S.checkins[semana] || {},
    guardar: v => {
      if (!v.freno && !v.corrijo) { delete S.checkins[semana]; return; }
      S.checkins[semana] = { ...v, fecha: hoy() };
      aviso('Check-in guardado');
    }
  });
};

function textoAvance() {
  const p = programa();
  const c = S.checkins[p.semana];
  const t = deLaSemana(p.semana);
  const cumplidos = RETOS.filter(r => S.retos[r.n]).length;
  const bajo = deudaInicial() - deudaTotal();
  const lineas = [
    'Mi avance · Control Financiero Familiar',
    (S.perfil.nombre ? S.perfil.nombre + ' · ' : '') + 'Día ' + p.dia + ' de ' + DIAS_PROGRAMA + ' · Semana ' + p.semana,
    'Retos cumplidos: ' + cumplidos + ' de ' + SEMANAS,
    'Movimientos registrados esta semana: ' + t.lista.length
  ];
  if (bajo > 0) lineas.push('Mi deuda ha bajado ' + dinero(bajo) + ' desde que empecé');
  if (ahorroTotal() > 0) lineas.push('Llevo ahorrado ' + dinero(ahorroTotal()));
  if (c && c.freno) lineas.push('Lo que me frenó: ' + c.freno);
  if (c && c.corrijo) lineas.push('Lo que corrijo: ' + c.corrijo);
  return lineas.join('\n');
}

ACC.enviarAvance = () => {
  hoja(`
    ${cabecera('Enviar mi avance')}
    <p class="ayuda">Esto es exactamente lo que se envía. Borra o cambia lo que no quieras compartir. Tú eliges a quién se lo mandas.</p>
    <label class="campo"><span>Mensaje</span><textarea id="avanceTexto" rows="9">${esc(textoAvance())}</textarea></label>
    <div class="botones">
      <a class="btn principal" id="avanceWhats" target="_blank" rel="noopener">Enviar por WhatsApp</a>
      <button class="btn" data-a="copiarAvance">Copiar</button>
    </div>`);
  const enlazar = () => {
    $('#avanceWhats').href = 'https://wa.me/?text=' + encodeURIComponent($('#avanceTexto').value);
  };
  $('#avanceTexto').addEventListener('input', enlazar);
  enlazar();
};

ACC.copiarAvance = async () => {
  try {
    await navigator.clipboard.writeText($('#avanceTexto').value);
    aviso('Copiado');
  } catch (e) {
    $('#avanceTexto').select();
    aviso('Mantén presionado el texto para copiarlo');
  }
};

function fotoDia90() {
  return `
  <div class="cuatro">
    <div class="dato"><span>Deuda al empezar</span><b>${dinero(deudaInicial())}</b></div>
    <div class="dato"><span>Deuda hoy</span><b>${dinero(deudaTotal())}</b></div>
    <div class="dato"><span>Ahorrado</span><b class="verde">${dinero(ahorroTotal())}</b></div>
    <div class="dato"><span>Retos cumplidos</span><b>${RETOS.filter(r => S.retos[r.n]).length} de ${SEMANAS}</b></div>
  </div>`;
}

ACC.accionReto = id => RETOS[id - 1].accion[1]();
ACC.cumplirReto = id => { S.retos[id] = hoy(); guardar(); pintar(); aviso('💪 ¡Reto cumplido!'); };
ACC.desmarcarReto = id => { delete S.retos[id]; guardar(); pintar(); };

function formRadiografia() {
  formulario({
    titulo: 'Mi radiografía',
    ayuda: 'Nadie más ve esto. Se guarda solo en tu teléfono.',
    campos: [
      { n: 'emocion', t: 'select', l: 'Cuando pienso en mi dinero siento…', ops: EMOCIONES },
      { n: 'preocupa', t: 'texto', l: 'Lo que más me preocupa es…', ph: 'Ej. No saber cuánto me queda' },
      { n: 'identidad', t: 'texto', l: 'A partir de hoy soy alguien que…', req: true }
    ],
    valores: S.radio || { identidad: 'Observa, decide y dirige su dinero' },
    guardar: v => { S.radio = { ...v, fecha: hoy() }; aviso('Radiografía guardada'); }
  });
}


/************************************************************
 * REGISTRAR
 ************************************************************/

function abrirRegistrar() {
  hoja(`
    ${cabecera('¿Qué quieres registrar?')}
    <div class="opciones">
      <button class="opcion" data-a="regGasto"><span class="emo">🛒</span><b>Gasto</b><span>Algo que pagaste</span></button>
      <button class="opcion" data-a="regIngreso"><span class="emo">💵</span><b>Ingreso</b><span>Dinero que entró</span></button>
      <button class="opcion" data-a="regPago"><span class="emo">💳</span><b>Pago a deuda</b><span>Tarjeta o préstamo</span></button>
      <button class="opcion" data-a="regAporte"><span class="emo">🏦</span><b>Ahorro</b><span>Aporte a una meta</span></button>
      <button class="opcion" data-a="subirEstado"><span class="emo">📄</span><b>Estado de cuenta</b><span>Actualiza el saldo del banco</span></button>
      <button class="opcion" data-a="importar"><span class="emo">📥</span><b>Importar del banco</b><span>Movimientos en CSV</span></button>
      ${conNegocio() ? '<button class="opcion" data-a="subirPyG"><span class="emo">📊</span><b>P&L</b><span>Resultados del negocio</span></button>' : ''}
    </div>`);
}

ACC.regGasto = () => formMov('gasto');
ACC.regIngreso = () => formMov('ingreso');
ACC.regPago = () => elegirDeudaParaPago();
ACC.regAporte = () => elegirMetaParaAporte();

function formMov(tipo, m) {
  const gasto = tipo === 'gasto';
  const id = m ? m.id : uid();

  /* fotoNueva: undefined = sin cambios, '' = quitarla, 'data:…' = nueva */
  let fotoNueva;
  let fotoVista = '';

  const campos = [
    { n: 'monto', t: 'dinero', l: gasto ? '¿Cuánto gastaste?' : '¿Cuánto entró?', req: true },
    { n: 'cat', t: 'select', l: 'Categoría', ops: Object.keys(gasto ? CAT_GASTO : CAT_INGRESO) },
    { n: 'nota', t: 'texto', l: 'Descripción (opcional)', ph: gasto ? 'Ej. Supermercado' : 'Ej. Quincena' },
    { n: 'fecha', t: 'fecha', l: 'Fecha' },
    ...campoCuenta(gasto ? '¿De dónde salió?' : '¿A dónde entró?'),
    ...campoAmbito(),
    ...(conNegocio() && gasto ? [{ n: 'origen', t: 'select', l: 'Si es del negocio: ¿con qué se pagó?', ops: [['negocio', '🏢 Dinero o tarjeta del negocio'], ['casa', '🏠 Dinero o tarjeta personal (el negocio te lo debe)']] }] : []),
    ...((S.eventos || []).some(e => !e.cerrado || (m && m.evento === e.id)) ? [{ n: 'evento', t: 'select', l: '¿Es de un evento?', ops: [['', 'No'], ...S.eventos.filter(e => !e.cerrado || (m && m.evento === e.id)).map(e => [e.id, '🎪 ' + e.nombre])] }] : [])
  ];
  if (gasto) campos.splice(2, 0, { n: 'pago', t: 'select', l: '¿Cómo pagaste?', ops: Object.entries(FORMAS_PAGO) });
  if (gasto) campos.push({ n: 'fuga', t: 'check', l: 'Es una fuga: pude no haberlo gastado' });
  if (!m) campos.push({ n: 'repite', t: 'check', l: 'Se repite cada mes (guardarlo como fijo)' });

  formulario({
    titulo: (m ? 'Editar ' : 'Nuevo ') + tipo,
    campos,
    valores: m || { fecha: hoy(), cuenta: cuentaPorDefecto(), ambito: ambitoPorDefecto(), pago: S.perfil.ultimoPago || 'credito', origen: 'negocio' },
    extra: gasto ? `
      <div class="campo"><span>Foto de la factura (opcional)</span>
        <div id="fotoZona"></div>
        <input type="file" id="fotoArchivo" accept="image/*" capture="environment" hidden>
      </div>` : '',
    alAbrir: form => {
      if (!gasto) return;
      const zona = $('#fotoZona');

      const pintarFoto = () => {
        zona.innerHTML = fotoVista ? `
          <img class="factura" id="fotoImg" src="${fotoVista}" alt="Factura">
          <div class="botones">
            <button type="button" class="btn chico" id="fotoLeer">🔎 Leer el total</button>
            <button type="button" class="btn chico" id="fotoQuitar">Quitar foto</button>
          </div>
          <p class="ayuda">La foto se guarda solo en este teléfono. La lectura es una ayuda: revisa siempre el monto.</p>` : `
          <button type="button" class="btn ancho" id="fotoTomar">📷 Tomar foto de la factura</button>`;

        if (!fotoVista) {
          $('#fotoTomar').addEventListener('click', () => $('#fotoArchivo').click());
          return;
        }
        $('#fotoImg').addEventListener('click', e => e.target.classList.toggle('grande'));
        $('#fotoQuitar').addEventListener('click', () => { fotoVista = ''; fotoNueva = ''; pintarFoto(); });
        $('#fotoLeer').addEventListener('click', async e => {
          const b = e.target;
          b.disabled = true;
          b.textContent = 'Leyendo… puede tardar';
          try {
            const total = await leerTotal(fotoVista);
            if (total > 0) {
              form.elements.monto.value = total;
              aviso('Leí ' + dinero(total) + '. Revísalo antes de guardar.');
            } else {
              aviso('No pude leer el total. Escríbelo tú.');
            }
          } catch (err) {
            aviso('No pude leer la foto (¿sin señal?). Escribe el monto.');
          }
          if (b.isConnected) { b.disabled = false; b.textContent = '🔎 Leer el total'; }
        });
      };

      $('#fotoArchivo').addEventListener('change', async e => {
        const archivo = e.target.files[0];
        if (!archivo) return;
        try {
          fotoVista = fotoNueva = await comprimir(archivo);
          pintarFoto();
        } catch (err) {
          aviso('No se pudo abrir esa foto');
        }
      });

      pintarFoto();
      if (m && m.foto) {
        fotoLeer(m.id)
          .then(f => { if (f && fotoNueva === undefined) { fotoVista = f; pintarFoto(); } })
          .catch(() => {});
      }
    },
    borrar: m ? () => {
      moverCuenta(m.cuenta, -signo(m) * m.monto);
      S.mov = S.mov.filter(x => x.id !== m.id);
      if (m.foto) fotoBorrar(m.id);
    } : null,
    guardar: v => {
      v.fecha = v.fecha || hoy();
      v.cuenta = v.cuenta || '';
      const repite = v.repite;
      delete v.repite;

      if (fotoNueva) {
        fotoGuardar(id, fotoNueva).catch(() => aviso('No se pudo guardar la foto'));
        v.foto = true;
      } else if (fotoNueva === '') {
        fotoBorrar(id);
        v.foto = false;
      }

      if (m) {
        moverCuenta(m.cuenta, -signo(m) * m.monto);
        Object.assign(m, v);
        moverCuenta(m.cuenta, signo(m) * m.monto);
      } else {
        const nuevo = { id, tipo, ...v };
        if (repite) {
          const fijo = {
            id: uid(), tipo, nombre: v.nota || v.cat, monto: v.monto, cat: v.cat,
            dia: aFecha(v.fecha).getDate(), cuenta: v.cuenta, ambito: ambitoDe(v)
          };
          S.fijos.push(fijo);
          nuevo.fijoId = fijo.id;
        }
        S.mov.push(nuevo);
        moverCuenta(nuevo.cuenta, signo(nuevo) * nuevo.monto);
        aviso(gasto ? 'Gasto registrado' : 'Ingreso registrado');
        if (v.fecha.slice(0, 7) <= mesActual()) mesVer = v.fecha.slice(0, 7);
      }
      if (v.cuenta) S.perfil.ultimaCuenta = v.cuenta;
      if (v.pago) S.perfil.ultimoPago = v.pago;
    }
  });
}


/************************************************************
 * HOJA Y FORMULARIOS
 ************************************************************/

function cabecera(titulo, sinCerrar) {
  return `<div class="fila"><h2>${esc(titulo)}</h2>${sinCerrar ? '' : '<button class="cerrar" data-a="cerrar" aria-label="Cerrar">✕</button>'}</div>`;
}

function hoja(html) {
  $('#hoja').innerHTML = html;
  $('#fondo').hidden = false;
  $('#hoja').scrollTop = 0;
}

function cerrarHoja() { $('#fondo').hidden = true; $('#hoja').innerHTML = ''; }
ACC.cerrar = cerrarHoja;

function campoHTML(c, valor) {
  const v = valor ?? '';
  if (c.t === 'check') {
    return `<label class="campo check"><input type="checkbox" name="${c.n}" ${v ? 'checked' : ''}><span>${esc(c.l)}</span></label>`;
  }
  let control;
  if (c.t === 'select') {
    control = `<select name="${c.n}">` + c.ops.map(o => {
      const [val, txt] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(txt)}</option>`;
    }).join('') + `</select>`;
  } else if (c.t === 'fecha') {
    control = `<input type="date" name="${c.n}" value="${esc(v)}" max="${hoy()}">`;
  } else if (c.t === 'mes') {
    control = `<input type="month" name="${c.n}" value="${esc(v)}" max="${mesActual()}">`;
  } else if (c.t === 'fechaFutura') {
    control = `<input type="date" name="${c.n}" value="${esc(v)}">`;
  } else if (c.t === 'dinero' || c.t === 'numero') {
    control = `<input type="text" inputmode="decimal" autocomplete="off" name="${c.n}" value="${v === 0 ? '' : esc(v)}"
      placeholder="${esc(c.ph || '0')}" class="${c.t === 'dinero' && c.req ? 'dinero' : ''}">`;
  } else if (c.t === 'ultimos4') {
    control = `<input type="text" inputmode="numeric" autocomplete="off" name="${c.n}" value="${esc(v)}" placeholder="1234">`;
  } else if (c.t === 'parrafo') {
    control = `<textarea name="${c.n}" rows="3" maxlength="300" placeholder="${esc(c.ph || '')}">${esc(v)}</textarea>`;
  } else {
    control = `<input type="text" name="${c.n}" value="${esc(v)}" placeholder="${esc(c.ph || '')}" maxlength="80" autocomplete="off">`;
  }
  return `<label class="campo"><span>${esc(c.l)}</span>${control}</label>`;
}

function formulario({ titulo, ayuda, campos, valores = {}, guardar: alGuardar, borrar, texto = 'Guardar', sinCerrar, extra = '', alAbrir }) {
  hoja(`
    ${cabecera(titulo, sinCerrar)}
    ${ayuda ? `<p class="ayuda">${esc(ayuda)}</p>` : ''}
    <form id="form" novalidate>
      ${campos.map(c => campoHTML(c, valores[c.n])).join('')}
      ${extra}
      <div class="botones">
        ${borrar ? '<button type="button" class="btn peligro" id="btnBorrar">Borrar</button>' : ''}
        <button type="submit" class="btn principal">${esc(texto)}</button>
      </div>
    </form>`);

  const form = $('#form');

  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = {};
    for (const c of campos) {
      const el = form.elements[c.n];
      if (c.t === 'check') v[c.n] = el.checked;
      else if (c.t === 'dinero' || c.t === 'numero') v[c.n] = Math.max(0, r2(num(el.value)));
      else if (c.t === 'ultimos4') v[c.n] = soloUltimos4(el.value);
      else v[c.n] = el.value.trim();

      if (c.req && !v[c.n]) {
        el.focus();
        aviso('Falta: ' + c.l.replace(/[¿?…]/g, ''));
        return;
      }
    }
    alGuardar(v);
    guardar();
    cerrarHoja();
    pintar();
  });

  if (borrar) {
    let confirmado = false;
    $('#btnBorrar').addEventListener('click', e => {
      if (!confirmado) {
        confirmado = true;
        e.target.textContent = '¿Seguro? Toca otra vez';
        return;
      }
      borrar();
      guardar();
      cerrarHoja();
      pintar();
      aviso('Borrado');
    });
  }

  if (alAbrir) alAbrir(form);

  const primero = form.querySelector('input.dinero');
  if (primero && !primero.value) setTimeout(() => primero.focus(), 150);
}


/************************************************************
 * AJUSTES, RESPALDO Y COMPARTIR
 ************************************************************/

const ICO = {
  persona: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  casa: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  ingresos: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  banco: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/>',
  pyg: '<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M14 3.3A9 9 0 0 1 20.7 10H14z"/>',
  bajar: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  subir: '<path d="M12 21V9M7 14l5-5 5 5"/><path d="M5 3h14"/>',
  compartir: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4M12 2v14"/>',
  actualizar: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  borrar: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  importar: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  reglas: '<path d="M4 6h16M4 12h10M4 18h6"/>',
  evento: '<path d="M4 21V4l8 3 8-3v13l-8 3-8-3"/>',
  puente: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>'
};
const tile = (ic, color = '') => `<span class="tile ${color}"><svg viewBox="0 0 24 24">${ICO[ic]}</svg></span>`;
const filaAjuste = ({ a, id, ic, color, titulo, sub, attrs = '' }) => `
  <button class="ajuste" ${a ? `data-a="${a}"` : ''} ${id ? `data-id="${id}"` : ''} ${attrs}>
    ${tile(ic, color)}<span class="txt"><b>${titulo}</b>${sub ? `<span>${sub}</span>` : ''}</span><span class="flecha">›</span>
  </button>`;

function abrirAjustes() {
  const ultimo = S.perfil.ultimoRespaldo;
  hoja(`
    ${cabecera('Ajustes')}

    <p class="grupo-titulo">Mi perfil</p>
    <form id="formAjustes" class="grupo" novalidate>
      <label class="campo"><span>Tu nombre</span><input type="text" name="nombre" value="${esc(S.perfil.nombre)}" maxlength="40" autocomplete="name"></label>
      <label class="campo"><span>Tu correo</span><input type="email" name="correo" value="${esc(S.perfil.correo || '')}" maxlength="80" placeholder="tu@correo.com" autocomplete="email" inputmode="email"></label>
      <p class="ayuda" style="margin:-8px 16px 12px">Para enviarte recordatorios de pagos en el futuro. Por ahora se guarda solo en este teléfono y no se envía a ningún lado.</p>
      <label class="campo"><span>Nombre de tu negocio (opcional)</span><input type="text" name="negocio" value="${esc(S.perfil.negocio)}" maxlength="40" placeholder="Ej. Mi Empresa LLC"></label>
      <label class="campo"><span>Símbolo de moneda</span><input type="text" name="moneda" value="${esc(S.perfil.moneda)}" maxlength="4"></label>
      <label class="campo"><span>Día en que empezaste los 90 días</span><input type="date" name="inicio" value="${esc(S.perfil.inicio)}" max="${hoy()}"></label>
      <div class="campo"><button type="submit" class="btn principal ancho">Guardar perfil</button>
        <p class="ayuda">Si escribes el nombre de tu negocio, puedes separar todo en Personal y Negocio y ver los dos panoramas.</p></div>
    </form>

    <p class="grupo-titulo">Seguridad</p>
    <div class="grupo">${filasSeguridad()}${GOATCOUNTER ? filaAjuste({ a: 'alternarEstadisticas', ic: 'pyg', titulo: S.perfil.estadisticas === false ? 'Estadísticas anónimas: desactivadas' : 'Estadísticas anónimas: activadas', sub: 'Solo cuenta cuántas personas usan la app. Nunca tus datos.' }) : ''}</div>

    <p class="grupo-titulo">Apariencia</p>
    <div class="segmento tres">
      ${[['oscuro', '🌙 Oscuro'], ['claro', '☀️ Claro'], ['auto', '📱 Auto']].map(([k, t]) => `<button type="button" data-a="tema" data-id="${k}" class="${(S.perfil.tema || 'oscuro') === k ? 'activo' : ''}">${t}</button>`).join('')}
    </div>

    <p class="grupo-titulo">General</p>
    <div class="grupo">
      ${filaAjuste({ a: 'guiaPaso', id: '1', ic: 'casa', titulo: 'Bienvenida guiada', sub: S.perfil.guiaHecha ? 'Hecha el ' + fechaCorta(S.perfil.guiaHecha) + ' · repetir o agregar' : 'Arma tu mapa en 5 pasos' })}
      ${filaAjuste({ a: 'ir', id: 'ingresos', ic: 'ingresos', titulo: 'Ingresos', sub: 'Fuentes de ingreso y cobros del mes' })}
      ${filaAjuste({ a: 'categorias', ic: 'pyg', titulo: 'Categorías de gastos', sub: Object.keys(S.catsPropias || {}).length ? Object.keys(S.catsPropias).length + ' propias · agrega productos o servicios' : 'Agrega productos o servicios' })}
      ${filaAjuste({ a: 'editarPresupuesto', ic: 'casa', titulo: 'Presupuesto de la casa', sub: presupuestoTotal() ? dinero(presupuestoTotal()) + ' al mes' : 'Sin definir' })}
      ${filaAjuste({ a: 'subirEstado', ic: 'banco', titulo: 'Estados de cuenta', sub: S.cuentas.length ? S.cuentas.length + (S.cuentas.length === 1 ? ' cuenta' : ' cuentas') + ' · ' + dinero(suma(S.cuentas, c => c.saldo)) : 'Actualiza el saldo de tus bancos' })}
      ${conNegocio() ? filaAjuste({ a: 'verEventos', ic: 'evento', titulo: 'Eventos', sub: (S.eventos || []).length ? S.eventos.length + ' evento(s)' : 'Presupuesto y P&L de cada evento' }) : ''}
      ${conNegocio() ? filaAjuste({ a: 'verNegocioCasa', ic: 'puente', titulo: 'Negocio ↔ Casa', sub: 'Lo que el negocio le debe a tu casa: ' + dinero(cuentaNegocioCasa().saldo) }) : ''}
      ${conNegocio() ? filaAjuste({ a: 'subirPyG', ic: 'pyg', titulo: 'P&L del negocio', sub: S.pyg.length ? S.pyg.length + ' periodo(s) registrados' : 'Sube el estado de resultados' }) : ''}
    </div>

    <p class="grupo-titulo">Herramientas de datos</p>
    <div class="grupo">
      ${filaAjuste({ a: 'importar', ic: 'importar', titulo: 'Importar movimientos (CSV)', sub: 'Amex, Chase, BofA, Wells Fargo, Capital One, Discover' })}
      ${filaAjuste({ a: 'reglas', ic: 'reglas', titulo: 'Reglas de categorías', sub: (S.reglas || []).length ? S.reglas.length + ' aprendidas' : 'Se aprenden al importar' })}
      ${filaAjuste({ a: 'mensajeDia', ic: 'calendario', titulo: 'Mensaje del día', sub: ({ ambos: 'Versículo y consejo', consejo: 'Solo consejo', no: 'Apagado' })[modoMensaje()] + (notifActiva() ? ' · 🔔 activadas' : ' · recíbelo cada mañana') })}
      ${filaAjuste({ a: 'calendario', ic: 'calendario', titulo: 'Pagos en mi Calendario', sub: 'Recordatorios en el iPhone, 3 días antes' })}
      ${filaAjuste({ a: 'respaldar', ic: 'bajar', color: 'verde', titulo: 'Guardar copia', sub: ultimo ? 'Última copia: ' + esc(fechaCorta(ultimo)) : 'Todavía no has guardado ninguna' })}
      ${filaAjuste({ a: 'restaurar', ic: 'subir', titulo: 'Recuperar copia', sub: 'Carga un archivo de respaldo (.json)' })}
      ${filaAjuste({ a: 'compartir', ic: 'compartir', titulo: 'Compartir la app', sub: 'Cada persona tiene sus propios datos' })}
    </div>
    <input type="file" id="archivo" hidden>

    <p class="grupo-titulo">App</p>
    <div class="grupo">
      ${filaAjuste({ a: versionNueva ? 'actualizar' : 'buscarVersion', ic: 'actualizar', color: versionNueva ? 'amarillo' : '', titulo: versionNueva ? 'Actualizar a ' + esc(versionNueva) : 'Buscar actualización', sub: 'Tienes la versión ' + VERSION + (BETA ? ' · Beta gratis' : '') })}
      ${filaAjuste({ ic: 'escudo', titulo: 'Privacidad', sub: 'Tus datos financieros se quedan en este teléfono', attrs: 'type="button" onclick="document.getElementById(\'avisoLegal\').hidden=false"' })}
      ${filaAjuste({ ic: 'borrar', color: 'rojo', titulo: 'Borrar todos mis datos', sub: 'No se puede deshacer', attrs: 'id="btnBorrarTodo" type="button"' }).replace('class="ajuste"', 'class="ajuste peligro"')}
    </div>

    <p class="legal" id="avisoLegal" hidden style="text-align:left;margin:16px 4px 0">
      <b>Aviso.</b> Control Financiero Familiar es una herramienta educativa de La Tribu Los Inquebrantables para organizar tus propios números.
      No es asesoría financiera, legal, fiscal ni de inversión, y no garantiza resultados. Las estimaciones dependen de los datos que tú registras.
      Para decisiones importantes consulta a un profesional autorizado.<br><br>
      <b>Privacidad.</b> Lo que escribes y las fotos de tus facturas se guardan únicamente en este dispositivo. Tus datos financieros no se envían a ningún servidor y nadie más puede verlos.
      La app no se conecta con tu banco. De tus tarjetas y cuentas solo guarda los últimos 4 números: nunca escribas números completos, contraseñas ni claves.
      Los estados de cuenta y P&L que subes se leen en el teléfono y no se guardan; solo quedan los números que confirmas.
      La copia de respaldo contiene todos tus datos; guárdala en un lugar que solo tú controles.<br><br>
      <b>Estadísticas anónimas.</b> Para saber cuántas personas usan la app, se cuenta cada apertura y algunos pasos (instalarla, terminar la bienvenida, activar el bloqueo) con GoatCounter, sin cookies. No se envían nombres, correos, montos ni ningún dato financiero. Puedes desactivarlo en ☰ → Seguridad.
    </p>`);

  $('#formAjustes').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.elements;
    S.perfil.nombre = f.nombre.value.trim();
    const correo = f.correo.value.trim();
    if (correo && !correoValido(correo)) { f.correo.focus(); aviso('Revisa el correo: parece incompleto'); return; }
    S.perfil.correo = correo.toLowerCase();
    S.perfil.moneda = f.moneda.value.trim() || '$';
    if (f.inicio.value) S.perfil.inicio = f.inicio.value;
    S.perfil.negocio = f.negocio.value.trim();
    guardar(); cerrarHoja(); pintar(); aviso('Guardado');
  });

  let confirmado = false;
  $('#btnBorrarTodo').addEventListener('click', e => {
    if (!confirmado) {
      confirmado = true;
      e.currentTarget.querySelector('.txt b').textContent = 'Se borra todo. Toca otra vez para confirmar';
      return;
    }
    localStorage.removeItem(CLAVE);
    localStorage.removeItem(CLAVE_LOCK);
    fotosBorrarTodas();
    S = nuevoEstado();
    mesVer = mesActual();
    vistaActual = 'inicio';
    pintar();
    bienvenida();
  });

  $('#archivo').addEventListener('change', e => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = async () => {
      try {
        const d = JSON.parse(lector.result);
        if (!d || !d.perfil || !Array.isArray(d.mov)) throw new Error('formato');
        const fotos = d.fotos || {};
        delete d.fotos;
        localStorage.setItem(CLAVE, JSON.stringify(d));
        S = leer();
        await fotosBorrarTodas();
        for (const [id, datos] of Object.entries(fotos)) {
          if (typeof datos === 'string' && datos.startsWith('data:image/')) await fotoGuardar(id, datos).catch(() => {});
        }
        cerrarHoja(); pintar(); aviso('Copia recuperada');
      } catch (err) {
        aviso('Ese archivo no es una copia de esta app');
      }
    };
    lector.readAsText(archivo);
  });
}

ACC.restaurar = () => $('#archivo').click();

ACC.respaldar = async () => {
  const nombre = 'control-financiero-' + hoy() + '.json';
  const texto = JSON.stringify({ ...S, fotos: await fotosTodas() });
  const hecho = () => {
    S.perfil.ultimoRespaldo = hoy();
    guardar();
    if ($('#fondo').hidden) pintar();
  };
  try {
    const archivo = new File([texto], nombre, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({ files: [archivo], title: 'Copia de Control Financiero' });
      hecho();
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  hecho();
  aviso('Copia guardada en tus descargas');
};

ACC.compartir = async () => {
  const url = location.origin + location.pathname;
  const datos = {
    title: 'Control Financiero Familiar',
    text: 'Lleva tus gastos, ingresos, deudas y ahorros, con un reto cada semana.',
    url
  };
  try {
    if (navigator.share) { await navigator.share(datos); return; }
    await navigator.clipboard.writeText(url);
    aviso('Enlace copiado');
  } catch (e) {
    if (!e || e.name !== 'AbortError') aviso(url);
  }
};

function enPantallaDeInicio() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/* Android ofrece instalar con un toque; iPhone solo desde el menú Compartir */
let instalador = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  instalador = e;
  if (vistaActual === 'inicio' && $('#fondo').hidden) pintar();
});

ACC.instalar = async () => {
  if (!instalador) return;
  instalador.prompt();
  await instalador.userChoice.catch(() => {});
  instalador = null;
  pintar();
};


/************************************************************
 * ACTUALIZACIONES
 ************************************************************/

let versionNueva = '';

async function buscarVersion() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const v = (await r.json()).version;
    if (v && v !== VERSION && v !== versionNueva) {
      versionNueva = v;
      if (vistaActual === 'inicio' && $('#fondo').hidden) pintar();
    }
    return true;
  } catch (e) {
    return false; // sin señal: se intenta la próxima vez
  }
}

ACC.buscarVersion = async () => {
  const pudo = await buscarVersion();
  if (versionNueva) abrirAjustes();
  else aviso(pudo ? 'Ya tienes la última versión' : 'Sin señal. Inténtalo más tarde.');
};

ACC.actualizar = async () => {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update();
  } catch (e) { /* se recarga de todos modos */ }
  location.reload();
};

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) buscarVersion();
});


/************************************************************
 * TEMA: OSCURO | CLARO | AUTOMÁTICO
 ************************************************************/

function aplicarTema() {
  const t = S.perfil.tema || 'oscuro';
  document.documentElement.dataset.tema = t;
  const claro = t === 'claro' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = claro ? '#d6e9f7' : '#14304a';
}
ACC.tema = id => { S.perfil.tema = id; aplicarTema(); guardar(); abrirAjustes(); };


/************************************************************
 * HISTORIAL MENSUAL Y CICLOS DE 90 DÍAS
 * Cada mes se guarda una "foto" de los totales para comparar
 * (como el cierre de la bolsa) y para el resumen del ciclo.
 ************************************************************/

function fotoActual() {
  const de = a => r2(suma(S.deudas.filter(d => ambitoDe(d) === a), d => d.saldo));
  const cu = a => r2(suma(S.cuentas.filter(c => ambitoDe(c) === a), c => c.saldo));
  const deudaP = de('personal'), deudaN = de('negocio');
  const cuentasP = cu('personal'), cuentasN = cu('negocio');
  return {
    deuda: r2(deudaP + deudaN), deudaP, deudaN,
    cuentas: r2(cuentasP + cuentasN), cuentasP, cuentasN,
    ahorro: r2(ahorroTotal()), fecha: hoy()
  };
}

const mesDelCiclo = () => Math.min(3, Math.floor((programa().dia - 1) / 30) + 1);

function registrarFoto() {
  if (!S.historial || typeof S.historial !== 'object') S.historial = {};
  S.historial[mesActual()] = fotoActual();
  if (!S.perfil.inicio) return;
  if (!S.ciclo || !S.ciclo.base) {
    S.ciclo = { n: (S.ciclos || []).length + 1, inicio: S.perfil.inicio, base: fotoActual(), cortes: {} };
  }
  S.ciclo.inicio = S.perfil.inicio;
  S.ciclo.cortes = S.ciclo.cortes || {};
  const m = mesDelCiclo();
  if (!S.ciclo.cortes[m]) S.ciclo.cortes[m] = fotoActual();
}

/* Valores de la foto según la vista elegida */
const deFoto = (f, campo) => {
  if (!f) return null;
  const v = vistaElegida();
  if (v === 'personal') return f[campo + 'P'] ?? f[campo];
  if (v === 'negocio') return f[campo + 'N'] ?? 0;
  return f[campo];
};

const mesAnterior = (m = mesActual()) => { const d = aFecha(m + '-01'); d.setMonth(d.getMonth() - 1); return iso(d).slice(0, 7); };

/* Referencia para comparar: el cierre del mes anterior o, si no existe, el inicio del ciclo */
function fotoReferencia() {
  const prev = S.historial && S.historial[mesAnterior()];
  if (prev) return { foto: prev, etq: 'vs ' + nombreMes(mesAnterior()).split(' ')[0].toLowerCase() };
  if (S.ciclo && S.ciclo.base && S.ciclo.base.fecha !== hoy()) return { foto: S.ciclo.base, etq: 'vs inicio del ciclo' };
  return { foto: null, etq: 'primer mes' };
}


/************************************************************
 * INDICADORES TIPO BOLSA (▲ ▼ en verde o rojo)
 * Verde = se movió en la dirección buena para tu bolsillo.
 ************************************************************/

function cambioPct(actual, antes) {
  if (antes === null || antes === undefined) return null;
  if (!antes) return actual ? null : 0;
  return (actual - antes) / Math.abs(antes) * 100;
}

function chip(c, bueno) {
  if (c === null) return '<span class="ind neutro">nuevo</span>';
  const sube = c > 0.05, baja = c < -0.05;
  if (!sube && !baja) return '<span class="ind neutro">= 0.0%</span>';
  const bien = (sube && bueno === 'sube') || (baja && bueno === 'baja');
  return `<span class="ind ${bien ? 'bien' : 'mal'}">${sube ? '▲' : '▼'} ${Math.abs(c).toFixed(1)}%</span>`;
}

function indicadores() {
  const ref = fotoReferencia();
  const r = resumen(mesActual());
  const rp = resumen(mesAnterior());
  const etqMes = 'vs ' + nombreMes(mesAnterior()).split(' ')[0].toLowerCase();
  const lista = [
    { nombre: 'Deuda total', icono: '💳', valor: deudaTotal(), antes: deFoto(ref.foto, 'deuda'), bueno: 'baja', etq: ref.etq },
    { nombre: 'Dinero en cuentas', icono: '🏦', valor: dineroEnCuentas(), antes: deFoto(ref.foto, 'cuentas'), bueno: 'sube', etq: ref.etq },
    { nombre: 'Ingresos del mes', icono: '💵', valor: r.ingresos, antes: rp.lista.length ? rp.ingresos : null, bueno: 'sube', etq: etqMes },
    { nombre: 'Gastos del mes', icono: '🛒', valor: r.gastos, antes: rp.lista.length ? rp.gastos : null, bueno: 'baja', etq: etqMes },
    { nombre: 'Pagado a deudas', icono: '✅', valor: r.pagos, antes: rp.lista.length ? rp.pagos : null, bueno: 'sube', etq: etqMes }
  ];
  if (vistaElegida() !== 'negocio') {
    lista.push({ nombre: 'Ahorro', icono: '🐖', valor: ahorroTotal(), antes: ref.foto ? ref.foto.ahorro : null, bueno: 'sube', etq: ref.etq });
  }
  if (conNegocio() && vistaElegida() !== 'personal' && S.pyg.length >= 1) {
    const orden = S.pyg.slice().sort((a, b) => b.mes.localeCompare(a.mes));
    const u = p => (p.ingresos - p.gastos) / (p.meses || 1);
    lista.push({ nombre: 'Utilidad del negocio', icono: '📊', valor: r2(u(orden[0])), antes: orden[1] ? r2(u(orden[1])) : null, bueno: 'sube', etq: 'vs P&L anterior', mensual: true });
  }
  return lista;
}

function tarjetaIndicadores(max) {
  const lista = indicadores().slice(0, max || 99);
  return `<div class="card ticker">` + lista.map(i => {
    const c = cambioPct(i.valor, i.antes);
    return `<div class="tick">
      <span class="punto">${i.icono}</span>
      <span class="txt"><b>${esc(i.nombre)}</b><span>${esc(i.etq)}${i.antes !== null && i.antes !== undefined ? ' · ' + dinero(i.antes) : ''}</span></span>
      <span class="der"><b>${dinero(i.valor)}${i.mensual ? '<small>/mes</small>' : ''}</b>${chip(c, i.bueno)}</span>
    </div>`;
  }).join('') + `<p class="ayuda" style="margin-top:10px"><span class="ind bien">▲▼</span> verde = va bien para tu bolsillo · <span class="ind mal">▲▼</span> rojo = cuidado</p></div>`;
}


/************************************************************
 * GRÁFICAS (SVG, sin librerías)
 ************************************************************/

const etqCorta = m => aFecha(m + '-01').toLocaleDateString('es', { month: 'short' }).replace('.', '');
const compacto = n => {
  const a = Math.abs(n);
  const t = a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k' : String(Math.round(a));
  return (n < 0 ? '-' : '') + S.perfil.moneda + t;
};

function graficaLinea(puntos, { color = 'var(--cyan)', bueno = 'baja' } = {}) {
  if (puntos.length < 2) {
    return `<p class="chico muted" style="margin:0">La gráfica se llena mes a mes. Vuelve el próximo mes para ver la tendencia.</p>`;
  }
  const W = 320, H = 150, px = 14, top = 18, bot = 26;
  const vals = puntos.map(p => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max === min) { max += 1; min -= 1; }
  const x = i => px + i * (W - 2 * px) / (puntos.length - 1);
  const y = v => top + (max - v) * (H - top - bot) / (max - min);
  const linea = puntos.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const area = `${x(0)},${H - bot} ${linea} ${x(puntos.length - 1)},${H - bot}`;
  const c = cambioPct(vals[vals.length - 1], vals[0]);
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  return `<div class="grafica">
    <div class="fila" style="margin-bottom:4px"><b>${dinero(vals[vals.length - 1])}</b>${chip(c, bueno)}</div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      <polygon points="${area}" fill="url(#${id})"/>
      <polyline points="${linea}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      ${puntos.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="3.5" fill="${color}"/>`).join('')}
    </svg>
    <div class="ejes">${puntos.map(p => `<span>${esc(p.etq)}</span>`).join('')}</div>
  </div>`;
}

function graficaBarras(meses) {
  const max = Math.max(1, ...meses.flatMap(m => [m.a, m.b]));
  return `<div class="barras">` + meses.map(m => `
    <div class="col">
      <div class="par">
        <i class="a" style="height:${pct(m.a, max)}%" title="Ingresos ${dinero(m.a)}"></i>
        <i class="b" style="height:${pct(m.b, max)}%" title="Gastos ${dinero(m.b)}"></i>
      </div>
      <span>${esc(m.etq)}</span>
    </div>`).join('') + `</div>
    <div class="leyenda"><span><i class="a"></i>Ingresos</span><span><i class="b"></i>Gastos</span></div>`;
}

function ultimosMeses(n) {
  const lista = [];
  let m = mesActual();
  for (let i = 0; i < n; i++) { lista.unshift(m); m = mesAnterior(m); }
  return lista;
}

function tarjetasGraficas() {
  const meses = ultimosMeses(6);
  const puntosDeuda = meses.filter(m => S.historial && S.historial[m])
    .map(m => ({ etq: etqCorta(m), v: deFoto(S.historial[m], 'deuda') }));
  if (S.ciclo && S.ciclo.base && !puntosDeuda.length) puntosDeuda.push({ etq: 'inicio', v: deFoto(S.ciclo.base, 'deuda') });
  const flujo = meses.map(m => { const r = resumen(m); return { etq: etqCorta(m), a: r.ingresos, b: r.gastos + r.pagos }; });
  const neto = flujo.map(f => f.a - f.b);
  return `
  <div class="card"><h2>📉 Tu deuda mes a mes</h2>${graficaLinea(puntosDeuda, { color: 'var(--cyan)', bueno: 'baja' })}</div>
  <div class="card"><h2>💵 Entra vs. sale</h2>${graficaBarras(flujo)}
    <p class="ayuda">"Sale" incluye gastos y pagos a deudas. Este mes: <b class="${neto[neto.length - 1] < 0 ? 'rojo' : 'verde'}">${dinero(neto[neto.length - 1])}</b> de diferencia.</p></div>`;
}


/************************************************************
 * RETO DEL MES (uno por cada mes del ciclo de 90 días)
 ************************************************************/

const RETOS_MES = [
  {
    n: 1, titulo: 'Ordena tu mapa',
    texto: 'Registra todo lo que tienes y todo lo que debes. Sin mapa no hay plan.',
    progreso: () => {
      const pasos = [
        ['Tus deudas registradas', S.deudas.length > 0],
        ['Tus ingresos fijos', S.fijos.some(f => f.tipo === 'ingreso')],
        ['Presupuesto de la casa', presupuestoTotal() > 0],
        ['Saldos de tus bancos al día', S.cuentas.some(c => c.actualizada && diasEntre(c.actualizada, hoy()) <= 35)]
      ];
      if (conNegocio()) pasos.push(['P&L del negocio', S.pyg.length > 0]);
      const hechos = pasos.filter(p => p[1]).length;
      return { val: hechos, meta: pasos.length, txt: hechos + ' de ' + pasos.length + ' pasos', pasos };
    }
  },
  {
    n: 2, titulo: 'Baja tu deuda 3%',
    texto: 'Paga más que el mínimo en tu deuda prioritaria y no cargues nada nuevo a las tarjetas.',
    progreso: () => {
      const ini = S.ciclo && S.ciclo.cortes && S.ciclo.cortes[2] ? S.ciclo.cortes[2].deuda : null;
      if (!ini) return { val: 0, meta: 3, txt: 'Empieza en el mes 2 del ciclo' };
      const bajo = Math.max(0, (ini - fotoActual().deuda) / ini * 100);
      return { val: r2(bajo), meta: 3, txt: 'Has bajado ' + bajo.toFixed(1) + '% de 3% (' + dinero(Math.max(0, ini - fotoActual().deuda)) + ')' };
    }
  },
  {
    n: 3, titulo: 'Arma tu colchón',
    texto: 'Aparta para tu fondo de protección al menos un mes de pagos mínimos.',
    progreso: () => {
      const base = S.ciclo && S.ciclo.cortes && S.ciclo.cortes[3] ? S.ciclo.cortes[3].ahorro : null;
      const meta = r2(Math.max(500, suma(S.deudas.filter(d => d.saldo > 0), d => d.minimo)));
      if (base === null) return { val: 0, meta, txt: 'Empieza en el mes 3 del ciclo' };
      const val = r2(Math.max(0, ahorroTotal() - base));
      return { val, meta, txt: dinero(val) + ' de ' + dinero(meta) };
    }
  }
];

function tarjetaRetoMes(r, compacta) {
  const actual = mesDelCiclo();
  const futuro = r.n > actual;
  const hecho = S.retosMes && S.retosMes[r.n];
  const p = r.progreso();
  const listo = p.val >= p.meta;
  let h = `<div class="card reto ${hecho ? 'hecho' : r.n === actual ? 'actual' : futuro ? 'futuro' : ''}">
    <span class="num">Reto del mes ${r.n} de 3${r.n === actual && !hecho ? ' · este mes' : ''}</span>
    <h3>${hecho ? '🏆 ' : futuro ? '🔒 ' : '🎯 '}${esc(r.titulo)}</h3>
    <p>${esc(r.texto)}</p>`;
  if (!futuro && !hecho) {
    h += `<div class="barra"><i style="width:${pct(p.val, p.meta)}%"></i></div><span class="chico muted">${esc(p.txt)}</span>`;
    if (!compacta && p.pasos) h += `<ul class="pasos">${p.pasos.map(s => `<li class="${s[1] ? 'ok' : ''}">${s[1] ? '✓' : '○'} ${esc(s[0])}</li>`).join('')}</ul>`;
    h += `<div class="botones"><button class="btn chico principal" data-a="cumplirRetoMes" data-id="${r.n}" ${listo ? '' : 'disabled'}>¡Lo logré!</button>
      ${compacta ? '<button class="btn chico" data-a="verRetos">Ver progreso</button>' : ''}</div>`;
  } else if (hecho) {
    h += `<p class="chico verde" style="margin-top:8px"><b>Logrado el ${esc(fechaCorta(hecho))}</b></p>`;
  }
  return h + `</div>`;
}

ACC.cumplirRetoMes = id => {
  S.retosMes = S.retosMes || {};
  S.retosMes[id] = hoy();
  guardar(); pintar(); aviso('🏆 ¡Reto del mes logrado!');
};


/************************************************************
 * FIN DEL CICLO: RESUMEN Y NUEVO CICLO DE 90 DÍAS
 ************************************************************/

function resumenCiclo() {
  const c = S.ciclo || { n: 1, inicio: S.perfil.inicio, base: fotoActual() };
  const ini = c.inicio || S.perfil.inicio || hoy();
  const fin = sumarDias(ini, DIAS_PROGRAMA - 1);
  const enC = x => x.fecha >= ini && x.fecha <= fin;
  const ahora = fotoActual();
  const movs = S.mov.filter(enC);
  return {
    n: c.n || 1, inicio: ini, fin, cerrado: hoy(),
    deudaIni: c.base.deuda, deudaFin: ahora.deuda,
    cuentasIni: c.base.cuentas, cuentasFin: ahora.cuentas,
    ahorroIni: c.base.ahorro, ahorroFin: ahora.ahorro,
    pagado: r2(suma(S.pagos.filter(enC), p => p.monto)),
    ingresos: r2(suma(movs.filter(x => x.tipo === 'ingreso'), x => x.monto)),
    gastos: r2(suma(movs.filter(x => x.tipo === 'gasto'), x => x.monto)),
    fugas: r2(suma(movs.filter(x => x.tipo === 'gasto' && x.fuga), x => x.monto)),
    retos: RETOS.filter(r => S.retos[r.n]).length,
    retosMes: Object.keys(S.retosMes || {}).length,
    checkins: Object.keys(S.checkins || {}).length
  };
}

function htmlResumen(r) {
  const bajoDeuda = r.deudaIni - r.deudaFin;
  const fila = (ic, t, v, extra) => `<li><span class="punto">${ic}</span><span class="txt"><b>${t}</b>${extra ? `<span>${extra}</span>` : ''}</span><span class="monto">${v}</span></li>`;
  return `<ul class="lista">
    ${fila('💳', bajoDeuda >= 0 ? 'Bajaste tu deuda' : 'Tu deuda subió', dinero(Math.abs(bajoDeuda)) + ' ' + chip(cambioPct(r.deudaFin, r.deudaIni), 'baja'), dinero(r.deudaIni) + ' → ' + dinero(r.deudaFin))}
    ${fila('✅', 'Pagaste a deudas', dinero(r.pagado))}
    ${fila('🏦', 'Dinero en cuentas', dinero(r.cuentasFin) + ' ' + chip(cambioPct(r.cuentasFin, r.cuentasIni), 'sube'), dinero(r.cuentasIni) + ' → ' + dinero(r.cuentasFin))}
    ${fila('🐖', 'Ahorro', dinero(r.ahorroFin) + ' ' + chip(cambioPct(r.ahorroFin, r.ahorroIni), 'sube'))}
    ${fila('💵', 'Entró / salió', dinero(r.ingresos) + ' / ' + dinero(r.gastos), r.fugas ? 'Fugas detectadas: ' + dinero(r.fugas) : '')}
    ${fila('🏆', 'Retos', r.retos + '/' + SEMANAS + ' semanales · ' + r.retosMes + '/3 del mes', r.checkins + ' check-ins')}
  </ul>`;
}

function leccionesCiclo(r) {
  const l = [];
  if (r.deudaFin < r.deudaIni) l.push('Vas en la dirección correcta: tu deuda bajó. En el próximo ciclo sube el "extra" del plan de salida.');
  else l.push('Tu deuda no bajó. En el próximo ciclo: cero compras nuevas con tarjeta y todo el extra a la deuda prioritaria.');
  if (r.fugas > 0) l.push('Tuviste ' + dinero(r.fugas) + ' en fugas. Elige una y elimínala desde la semana 1.');
  if (r.retos < SEMANAS / 2) l.push('Cumpliste menos de la mitad de los retos. Pon una alarma semanal para tu check-in.');
  if (r.cuentasFin <= r.cuentasIni) l.push('Tu dinero en cuentas no creció. Automatiza una transferencia al ahorro el día que cobras.');
  return l;
}

function tarjetaFinCiclo() {
  if (!S.perfil.inicio || !programa().terminado) return '';
  const r = resumenCiclo();
  return `<div class="card semaforo green">
    <h2>🏁 ¡Terminaste tu ciclo ${r.n} de 90 días!</h2>
    <p class="chico muted" style="margin:0 0 6px">${esc(fechaCorta(r.inicio))} – ${esc(fechaCorta(r.fin))}. Esto es lo que lograste:</p>
    ${htmlResumen(r)}
    <h2 style="margin-top:14px">Para tu próximo ciclo</h2>
    <ul class="consejos">${leccionesCiclo(r).map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    <div class="botones"><button class="btn principal" data-a="nuevoCiclo">🚀 Guardar y empezar el ciclo ${r.n + 1}</button></div>
  </div>`;
}

ACC.nuevoCiclo = () => {
  const r = resumenCiclo();
  hoja(`${cabecera('Empezar el ciclo ' + (r.n + 1))}
    <p class="ayuda">Se guarda el resumen del ciclo ${r.n}. Tus tarjetas, cuentas, ingresos y movimientos se quedan; los retos y check-ins vuelven a empezar.</p>
    <div class="botones"><button class="btn principal" data-a="confirmarCiclo">Empezar ciclo ${r.n + 1}</button></div>`);
};

ACC.confirmarCiclo = () => {
  const r = resumenCiclo();
  S.ciclos = S.ciclos || [];
  S.ciclos.push(r);
  S.perfil.inicio = hoy();
  S.retos = {};
  S.checkins = {};
  S.retosMes = {};
  S.ciclo = null;
  registrarFoto();
  guardar(); cerrarHoja(); ir('retos');
  aviso('🚀 ¡Ciclo ' + (r.n + 1) + ' en marcha!');
};

function tarjetaCiclos() {
  if (!S.ciclos || !S.ciclos.length) return '';
  return `<div class="seccion"><h2>Ciclos anteriores</h2></div>` + S.ciclos.slice().reverse().map(r => `
    <div class="card"><h2>Ciclo ${r.n} <small>· ${esc(fechaCorta(r.inicio))} – ${esc(fechaCorta(r.fin))} ${r.inicio.slice(0, 4)}</small></h2>${htmlResumen(r)}</div>`).join('');
}


/************************************************************
 * VISTA: PROGRESO (ciclo, indicadores, gráficas y retos)
 ************************************************************/

function vistaProgreso() {
  const p = programa();
  const c = S.ciclo || { n: 1 };
  const semanas = RETOS.filter(r => S.retos[r.n]).length;
  const meses = Object.keys(S.retosMes || {}).length;
  const etapa = (RETOS[p.semana - 1] || {}).etapa || '';
  let h = selectorVista();

  h += `<div class="seccion"><h2>Tu ciclo ${c.n || 1}</h2></div>
  <div class="card hero">
    <div class="cuerpo">
      <div class="cifras">
        <div><span>Etapa</span><b>${esc(etapa.charAt(0) + etapa.slice(1).toLowerCase())}</b></div>
        <div><span>Retos de la semana</span><b>${semanas} de ${SEMANAS}</b></div>
        <div><span>Retos del mes</span><b>${meses} de 3</b></div>
      </div>
      ${anillo(p.dia / DIAS_PROGRAMA, `<b>Día ${p.dia}</b><small>de ${DIAS_PROGRAMA}</small>`)}
    </div>
    ${S.perfil.inicio ? `<p class="ayuda centro" style="margin-top:12px">${esc(fechaCorta(S.perfil.inicio))} – ${esc(fechaCorta(sumarDias(S.perfil.inicio, DIAS_PROGRAMA - 1)))}</p>` : ''}
  </div>`;

  h += tarjetaFinCiclo();
  h += `<div class="seccion"><h2>Indicadores</h2></div>` + tarjetaIndicadores();
  h += `<div class="seccion"><h2>Desempeño</h2></div>` + tarjetasGraficas() + tarjetaComparar(true);
  h += `<div class="seccion"><h2>Retos del mes</h2></div>` + RETOS_MES.map(r => tarjetaRetoMes(r)).join('');
  h += `<div class="seccion"><h2>Retos de la semana</h2></div>` + vistaRetos();
  h += tarjetaCiclos();
  return h;
}

/************************************************************
 * BIENVENIDA
 ************************************************************/

function bienvenida() {
  formulario({
    titulo: 'Bienvenido 👋',
    ayuda: 'En 10 minutos armamos el mapa de tu dinero: lo que entra, lo que pagas, lo que debes y lo que tienes. Al final verás la salud financiera de tu casa y tu primer paso. Todo se guarda solo en tu teléfono.',
    campos: [
      { n: 'nombre', t: 'texto', l: '¿Cómo te llamas?', ph: 'Tu nombre' },
      { n: 'correo', t: 'texto', l: 'Tu correo (opcional, para recordatorios)', ph: 'tu@correo.com' },
      { n: 'negocio', t: 'texto', l: '¿Tienes negocio propio? Escribe su nombre (opcional)', ph: 'Ej. Mi Empresa LLC' }
    ],
    texto: 'Empezar: armar mi mapa (10 min)',
    sinCerrar: true,
    guardar: v => {
      S.perfil.nombre = v.nombre;
      S.perfil.correo = correoValido(v.correo) ? v.correo.trim().toLowerCase() : '';
      S.perfil.negocio = (v.negocio || '').trim();
      S.perfil.inicio = hoy();
      setTimeout(() => abrirGuia(1), 80);
    }
  });
}


/************************************************************
 * MENSAJE DEL DÍA: un versículo y un consejo de dinero cada día
 * Versículos: Reina-Valera 1909 (dominio público), ortografía adaptada.
 ************************************************************/

const VERSICULOS = [
  ['Proverbios 21:5', 'Los pensamientos del diligente ciertamente tienden a abundancia; mas todo presuroso, indefectiblemente a pobreza.'],
  ['Proverbios 22:7', 'El rico se enseñoreará de los pobres; y el que toma prestado, siervo es del que empresta.'],
  ['Proverbios 21:20', 'Tesoro codiciable y pingüe hay en la casa del sabio; mas el hombre insensato lo disipará.'],
  ['Lucas 14:28', '¿Cuál de vosotros, queriendo edificar una torre, no cuenta primero sentado los gastos, si tiene lo que necesita para acabarla?'],
  ['Proverbios 6:6-8', 'Ve a la hormiga, oh perezoso, mira sus caminos, y sé sabio; la cual prepara en el verano su comida, y allega en el tiempo de la siega su mantenimiento.'],
  ['Romanos 13:8', 'No debáis a nadie nada, sino amaros unos a otros.'],
  ['Hebreos 13:5', 'Sean las costumbres vuestras sin avaricia; contentos de lo presente.'],
  ['Proverbios 27:23', 'Considera atentamente el aspecto de tus ovejas; pon tu corazón a tus rebaños.'],
  ['Eclesiastés 5:10', 'El que ama el dinero, no se hartará de dinero; y el que ama el mucho tener, no sacará fruto.'],
  ['Lucas 16:10', 'El que es fiel en lo muy poco, también en lo más es fiel.'],
  ['Proverbios 3:9', 'Honra a Jehová de tu sustancia, y de las primicias de todos tus frutos.'],
  ['Mateo 6:21', 'Porque donde estuviere vuestro tesoro, allí estará vuestro corazón.'],
  ['Proverbios 10:4', 'La mano negligente hace pobre; mas la mano de los diligentes enriquece.'],
  ['Proverbios 22:3', 'El avisado ve el mal, y escóndese; mas los simples pasan, y reciben el daño.'],
  ['Proverbios 16:3', 'Encomienda a Jehová tus obras, y tus pensamientos serán afirmados.'],
  ['Salmos 37:21', 'El impío toma prestado, y no paga; mas el justo tiene misericordia, y da.'],
  ['Proverbios 28:20', 'El hombre de verdad tendrá muchas bendiciones; mas el que se apresura a enriquecer, no será sin culpa.'],
  ['2 Corintios 9:7', 'Cada uno dé como propuso en su corazón: no con tristeza, o por necesidad; porque Dios ama el dador alegre.'],
  ['Proverbios 24:27', 'Apresta tus obras de afuera, y disponlas en tu heredad; y después edificarás tu casa.'],
  ['1 Timoteo 6:10', 'Porque el amor del dinero es la raíz de todos los males.'],
  ['Filipenses 4:11', 'He aprendido a contentarme con lo que tengo.'],
  ['Proverbios 13:11', 'Disminuiráse la hacienda que fuere de vanidad; mas el que allega con su mano la aumenta.'],
  ['Proverbios 11:25', 'El alma liberal será engordada; y el que saciare, él también será saciado.'],
  ['Mateo 6:34', 'No os congojéis por el día de mañana; que el día de mañana traerá su fatiga: basta al día su afán.'],
  ['Proverbios 15:22', 'Los pensamientos son frustrados donde no hay consejo; mas en la multitud de consejeros se afirman.'],
  ['Proverbios 23:4-5', 'No trabajes por ser rico; pon coto a tu prudencia. ¿Has de poner tus ojos en las riquezas, siendo ningunas?'],
  ['Eclesiastés 11:2', 'Reparte a siete, y aun a ocho; porque no sabes el mal que vendrá sobre la tierra.'],
  ['Proverbios 30:8', 'Vanidad y palabra mentirosa aparta de mí; no me des pobreza ni riquezas; manténme del pan que me es necesario.'],
  ['Deuteronomio 8:18', 'Acuérdate de Jehová tu Dios: porque él te da el poder para hacer las riquezas.'],
  ['Proverbios 12:11', 'El que labra su tierra, se hartará de pan; mas el que sigue los vagabundos es falto de entendimiento.'],
  ['Gálatas 6:9', 'No nos cansemos, pues, de hacer bien; que a su tiempo segaremos, si no hubiéremos desmayado.']
];

const CONSEJOS = [
  'Antes de comprar algo que no planeaste, espera 24 horas. Si mañana todavía lo necesitas, decide con calma.',
  'Págate a ti primero: aparta tu ahorro el mismo día que cobras, no lo que sobre al final del mes.',
  'Un fondo de emergencia de $1,000 evita que una sorpresa termine en la tarjeta de crédito.',
  'Paga más que el mínimo. Cada dólar extra va directo al saldo y deja de cobrar intereses.',
  'Revisa tus suscripciones hoy. Las que no usaste este mes son dinero que se va sin avisar.',
  'Usa efectivo para restaurantes y antojos por una semana. Ver salir los billetes cambia las decisiones.',
  'Si una compra a crédito no la puedes pagar completa este mes, no la puedes pagar.',
  'Anota hoy cada gasto, por pequeño que sea. Lo que no se mide, no se mejora.',
  'Llama a tu banco y pide una tasa de interés más baja. Lo peor que puede pasar es que digan que no.',
  'Haz la lista antes de ir al supermercado y no vayas con hambre.',
  'El negocio y la casa en cuentas separadas: así sabes de verdad cuánto gana cada uno.',
  'Celebra cada deuda que liquides. Las pequeñas victorias te dan fuerza para la siguiente.',
  'Antes de un evento o viaje, junta el dinero primero. Financiarlo con tarjeta lo encarece.',
  'Cocinar en casa dos veces más por semana puede ahorrar más de $100 al mes.',
  'Pon tus pagos en automático para nunca pagar tarde. Un pago tarde puede subir tu interés.',
  'No uses más del 30% del límite de tus tarjetas: ayuda a tu puntaje de crédito.',
  'Habla de dinero en familia una vez por semana. Las metas compartidas se cumplen más rápido.',
  'Cada aumento de ingreso, divídelo: una parte para disfrutar y otra para ahorrar o pagar deudas.',
  'Compara la gasolina y los seguros cada año. Cambiar de proveedor también es ahorrar.',
  'Antes de cada compra pregúntate: ¿lo necesito, o solo lo quiero ahora?',
  'Un presupuesto no te quita libertad: te dice en qué puedes gastar sin culpa.',
  'Ahorra las monedas y los billetes de $1. Al final del año pueden sumar cientos.',
  'Si recibes un reembolso de impuestos, decide su destino antes de que llegue.',
  'Evita comprar por ansiedad o cansancio. Las emociones fuertes son malas consejeras financieras.',
  'Cuando termines de pagar una deuda, suma ese pago a la siguiente. Es la bola de nieve.',
  'Revisa tu estado de cuenta completo cada mes: así detectas cargos que no reconoces.',
  'Dar con generosidad y ahorrar con disciplina pueden ir juntos. Planéalos los dos.',
  'Usa la regla de los 30 días para compras grandes: si después de un mes la quieres, cómprala sin deuda.',
  'Tu salud financiera también es tranquilidad en casa. Cada buena decisión cuenta.',
  'Invierte primero en aprender: un buen hábito vale más que una buena racha.',
  'Hoy elige una cosa que no vas a comprar y guarda ese dinero en tu meta de ahorro.'
];

function mensajeDelDia(fecha = hoy()) {
  const d = new Date(fecha + 'T12:00:00');
  const n = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5) + d.getFullYear() * 7;
  return { versiculo: VERSICULOS[n % VERSICULOS.length], consejo: CONSEJOS[(n * 7 + 3) % CONSEJOS.length] };
}
const modoMensaje = () => S.perfil.mensajeDia || 'ambos'; /* ambos | consejo | no */

function tarjetaMensajeDia() {
  const modo = modoMensaje();
  if (modo === 'no') return '';
  const { versiculo: [cita, texto], consejo } = mensajeDelDia();
  return `<div class="card mensaje-dia">
    <p class="md-titulo">✨ Para hoy</p>
    ${modo === 'ambos' ? `<blockquote>“${esc(texto)}”<cite>${esc(cita)}</cite></blockquote>` : ''}
    <p class="md-consejo">💡 ${esc(consejo)}</p>
  </div>`;
}

/* Notificaciones: se muestran una vez al día cuando abres la app.
   Para recibirlas aunque no abras la app, se agrega el mensaje diario al Calendario. */
const notifPosible = () => 'Notification' in window && 'serviceWorker' in navigator;
const notifActiva = () => notifPosible() && Notification.permission === 'granted' && S.perfil.notificaciones !== false;

async function notificarMensajeDia() {
  try {
    if (!notifActiva() || localStorage.getItem('cff.notifDia') === hoy() || modoMensaje() === 'no') return;
    const reg = await navigator.serviceWorker.ready;
    const { versiculo: [cita, texto], consejo } = mensajeDelDia();
    await reg.showNotification('✨ Tu mensaje de hoy', {
      body: modoMensaje() === 'ambos' ? `“${texto}” (${cita})` : consejo,
      icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'mensaje-dia'
    });
    localStorage.setItem('cff.notifDia', hoy());
  } catch (e) { /* las notificaciones nunca afectan la app */ }
}

function generarICSMensajes(dias = 60) {
  const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Control Financiero Familiar//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Mensaje del día · Mi Control'];
  for (let i = 0; i < dias; i++) {
    const f = sumarDias(hoy(), i);
    const { versiculo: [cita, texto], consejo } = mensajeDelDia(f);
    const titulo = modoMensaje() === 'consejo' ? '💡 ' + consejo : '✨ ' + cita + ' · Mi Control';
    const desc = (modoMensaje() === 'consejo' ? '' : '“' + texto + '” (' + cita + ')\n\n') + '💡 ' + consejo + '\n\nAbre Mi Control: https://app.tribuinquebrantable.com';
    L.push('BEGIN:VEVENT', 'UID:mensaje-' + f + '@control-financiero', 'DTSTAMP:' + sello,
      'DTSTART;VALUE=DATE:' + fechaICS(f), 'DTEND;VALUE=DATE:' + fechaICS(sumarDias(f, 1)),
      'SUMMARY:' + escICS(titulo), 'DESCRIPTION:' + escICS(desc), 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escICS(titulo), 'TRIGGER:PT8H', 'END:VALARM', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}

ACC.mensajeDia = () => {
  const modo = modoMensaje();
  const permiso = notifPosible() ? Notification.permission : 'no';
  hoja(`${cabecera('✨ Mensaje del día')}
    <p class="ayuda">Cada día la app te muestra un versículo y un consejo de dinero y ahorro.</p>
    <div class="segmento tres" style="margin-bottom:16px">
      ${[['ambos', '📖 + 💡'], ['consejo', 'Solo 💡'], ['no', 'Apagado']].map(([k, t]) => `<button type="button" data-a="modoMensaje" data-id="${k}" class="${modo === k ? 'activo' : ''}">${t}</button>`).join('')}
    </div>
    <p class="grupo-titulo">Recibirlo cada mañana</p>
    <div class="botones">
      <button class="btn principal" data-a="mensajeCalendario">📅 Agregar al Calendario (8 a.m.)</button>
      ${permiso === 'no' ? '' : `<button class="btn" data-a="activarNotif" ${permiso === 'granted' ? 'disabled' : ''}>${permiso === 'granted' ? '🔔 Notificaciones activadas' : '🔔 Activar notificaciones'}</button>`}
    </div>
    <p class="ayuda">El <b>Calendario</b> te avisa todos los días a las 8 a.m. aunque no abras la app (60 días; luego vuelve a agregarlo).
    Las <b>notificaciones</b> llegan al abrir la app${/iPhone|iPad/.test(navigator.userAgent) ? ' y en el iPhone solo funcionan con la app instalada en tu pantalla de inicio' : ''}.</p>`);
};
ACC.modoMensaje = id => { S.perfil.mensajeDia = id; guardar(); pintar(); ACC.mensajeDia(); };
ACC.mensajeCalendario = async () => {
  const texto = generarICSMensajes();
  unaVez('mensaje-calendario');
  const archivo = new File([texto], 'mensaje-del-dia.ics', { type: 'text/calendar' });
  try {
    if (/iPhone|iPad|Android/.test(navigator.userAgent) && navigator.canShare && navigator.canShare({ files: [archivo] })) { await navigator.share({ files: [archivo], title: 'Mensaje del día · Mi Control' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  window.location.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(texto);
};
ACC.activarNotif = async () => {
  try {
    const r = await Notification.requestPermission();
    if (r === 'granted') { S.perfil.notificaciones = true; guardar(); localStorage.removeItem('cff.notifDia'); unaVez('notificaciones'); await notificarMensajeDia(); aviso('🔔 Notificaciones activadas'); }
    else aviso('Las notificaciones quedaron bloqueadas. Puedes activarlas en los ajustes del teléfono.');
  } catch (e) { aviso('Este teléfono no permite notificaciones desde aquí.'); }
  ACC.mensajeDia();
};


/************************************************************
 * ARRANQUE
 ************************************************************/

aplicarTema();
if (bloqueoActivo()) mostrarCandado();
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', aplicarTema);
try { registrarFoto(); guardar(); } catch (e) { /* sin almacenamiento */ }
pintar();
cargarEstadisticas();
if (!S.perfil.inicio) bienvenida();
else if (S.perfil.saludoDia !== hoy()) {
  /* bienvenida del día, como en la app del banco */
  setTimeout(() => aviso(saludo() + (primerNombre() ? ", " + primerNombre() : "") + " 👋"), 400);
  S.perfil.saludoDia = hoy();
  guardar();
}

try {
  const anterior = localStorage.getItem('cff.version');
  if (anterior && anterior !== VERSION) aviso('App actualizada a la versión ' + VERSION);
  localStorage.setItem('cff.version', VERSION);
} catch (e) { /* sin almacenamiento no hay aviso */ }

/* Aviso de la beta, una sola vez por teléfono */
function avisoBeta() {
  hoja(`${cabecera('🧪 Estás en la Beta')}
    <p class="ayuda">Gracias por ser de las primeras familias en usar <b>Control Financiero Familiar</b>.</p>
    <ul class="lista-beta">
      <li>🎁 <b>Todo es gratis</b> durante la beta.</li>
      <li>🛠️ Puede haber errores y cada semana llegan mejoras.</li>
      <li>💾 Guarda tu copia seguido: <b>Ajustes → Guardar copia</b>.</li>
      <li>💬 Cuéntanos qué te gusta y qué mejorarías.</li>
    </ul>
    <button class="btn principal ancho" data-a="betaOk">¡Entendido!</button>`);
}
ACC.betaOk = () => { try { localStorage.setItem('cff.beta', hoy()); } catch (e) { /* sin almacenamiento */ } cerrarHoja(); };
try {
  if (BETA && S.perfil.inicio && !localStorage.getItem('cff.beta') && !bloqueoActivo()) setTimeout(avisoBeta, 900);
} catch (e) { /* sin almacenamiento */ }

if (location.protocol.startsWith('http')) buscarVersion();
setTimeout(notificarMensajeDia, 1500);

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

ACC.verEventos = () => hoja(cabecera('Eventos') + tarjetaEventos());
ACC.verNegocioCasa = () => hoja(cabecera('Negocio ↔ Casa') + tarjetaNegocioCasa());
