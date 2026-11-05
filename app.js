'use strict';

/************************************************************
 * CONTROL FINANCIERO FAMILIAR
 * Los datos viven solo en este teléfono (localStorage; las
 * fotos de facturas en IndexedDB).
 * Cálculos trasladados de Code.gs (DESAFÍO FINANCIERO 90D).
 ************************************************************/

/* Al publicar un cambio: subir este número y el de version.json (deben ser iguales) */
const VERSION = '0.10.0';

const CLAVE = 'cff.v1';
const DIAS_PROGRAMA = 90;
const SEMANAS = 13;

const CAT_GASTO = {
  'Comida': '🛒', 'Vivienda': '🏠', 'Transporte': '🚗', 'Servicios': '💡',
  'Seguros': '🛡️', 'Salud': '🩺', 'Hijos': '🧒', 'Educación': '🎓', 'Diversión': '🎉',
  'Ropa': '👕', 'Suscripciones': '📺', 'Otros': '📦'
};
const CAT_INGRESO = { 'Salario': '💼', 'Negocio': '🏪', 'Extra': '✨', 'Otros': '💵' };
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
    instalarLuego: '', ultimoRespaldo: '', ultimaCuenta: '',
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
  radio: null   // {emocion, preocupa, identidad, fecha}
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

const TITULOS = { inicio: 'Inicio', deudas: 'Deudas', ahorros: 'Ahorros', retos: 'Retos semanales' };
const VISTAS = { inicio: vistaInicio, deudas: vistaDeudas, ahorros: vistaAhorros, retos: vistaRetos };

function ir(v) {
  vistaActual = v;
  window.scrollTo(0, 0);
  pintar();
}

function pintar() {
  const p = programa();
  $('#titulo').textContent = TITULOS[vistaActual];
  $('#hola').textContent =
    (S.perfil.nombre ? 'Hola, ' + S.perfil.nombre + ' · ' : '') +
    (p.terminado ? '90 días cumplidos' : 'Día ' + p.dia + ' de ' + DIAS_PROGRAMA);
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
    mensaje = 'Toca el botón verde (+) para registrar tu primer ingreso o gasto.';
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

  let h = tarjetaActualizar() + tarjetaInstalar() + tarjetaRespaldo() + selectorVista();

  const pendientes = esteMes ? fijosV().filter(f => !fijoHecho(f)) : [];
  const porPagar = suma(pendientes.filter(f => f.tipo === 'gasto'), f => f.monto);
  const porEntrar = suma(pendientes.filter(f => f.tipo === 'ingreso'), f => f.monto);
  const alFinal = r.queda + porEntrar - porPagar;

  h += `
  <div class="card semaforo ${color}">
    <div class="fila">
      <span class="muted chico">Te queda${conNegocio() && vistaElegida() !== 'todo' ? ' · ' + esc(etiquetaVista()) : ''}</span>
      <div class="mes">
        <button data-a="mes" data-id="-1" aria-label="Mes anterior">‹</button>
        <b>${esc(nombreMes(mesVer))}</b>
        <button data-a="mes" data-id="1" aria-label="Mes siguiente" ${esteMes ? 'disabled' : ''}>›</button>
      </div>
    </div>
    <p class="grande ${r.queda < 0 ? 'rojo' : ''}">${dinero(r.queda)}</p>
    <p class="chico muted" style="margin:0">${esc(mensaje)}</p>
    ${porPagar || porEntrar ? `
      <p class="chico" style="margin:8px 0 0">Faltan fijos${porEntrar ? ' por entrar ' + dinero(porEntrar) : ''}${porEntrar && porPagar ? ' y' : ''}${porPagar ? ' por pagar ' + dinero(porPagar) : ''}.
      Al final te quedarían <b class="${alFinal < 0 ? 'rojo' : ''}">${dinero(alFinal)}</b>.</p>` : ''}
    <div class="cuatro">
      <div class="dato"><span>Ingresos</span><b class="verde">${dinero(r.ingresos)}</b></div>
      <div class="dato"><span>Gastos</span><b>${dinero(r.gastos)}</b></div>
      <div class="dato"><span>Pagado a deudas</span><b>${dinero(r.pagos)}</b></div>
      <div class="dato"><span>Ahorrado</span><b>${dinero(r.aportes)}</b></div>
    </div>
  </div>`;

  const promos = esteMes ? promosPorVencer(120) : [];
  if (promos.length) {
    h += `<div class="card semaforo ${diasPromo(promos[0]) <= 60 ? 'red' : 'yellow'}">
      <h2>⏳ Promociones por terminar</h2>
      <ul class="consejos">${promos.map(d => `<li><b>${esc(d.nombre)}</b>: ${dinero(d.saldo)} al ${d.apr || 0}% hasta el ${esc(fechaCorta(d.promoFin))} (faltan ${diasPromo(d)} días).
        ${d.aprDespues ? 'Después: ' + d.aprDespues + '%, ≈ <b>' + dinero(r2(d.saldo * d.aprDespues / 1200)) + ' al mes</b> de interés.' : 'Anota el interés que tendrá después.'}
        No le cargues nada nuevo y define cómo la vas a pagar antes de esa fecha.</li>`).join('')}</ul>
    </div>`;
  }

  if (esteMes && vistaElegida() === 'todo') h += tarjetaPanorama();

  if (!p.terminado) {
    const hecho = S.retos[reto.n];
    h += `
    <div class="card reto ${hecho ? 'hecho' : 'actual'}">
      <span class="num">Reto de la semana ${reto.n} · ${reto.etapa}</span>
      <h3>${hecho ? '✅ ' : ''}${esc(reto.titulo)}</h3>
      <p>${esc(reto.texto)}</p>
      <div class="botones"><button class="btn chico ${hecho ? '' : 'principal'}" data-a="verRetos">${hecho ? 'Ver todos los retos' : 'Ir al reto'}</button></div>
    </div>`;
  }

  const prox = proximosPagos();
  if (prox.length) {
    h += `<div class="card"><h2>Pagos que vienen</h2><ul class="lista">` +
      prox.map(d => `
        <li>
          <span class="punto">📅</span>
          <span class="txt"><b>${esc(d.nombre)}</b>
            <span>${d.faltan === 0 ? 'Vence hoy' : d.faltan === 1 ? 'Vence mañana' : 'Vence en ' + d.faltan + ' días'} · mínimo ${dinero(d.minimo)}</span></span>
          <button class="btn chico" data-a="pagar" data-id="${d.id}">Pagar</button>
        </li>`).join('') +
      `</ul></div>`;
  }

  if (esteMes) h += tarjetaFijos() + tarjetaDinero();

  if (vistaElegida() !== 'personal' && conNegocio()) h += tarjetaPyG();

  const gastos = r.lista.filter(x => x.k === 'mov' && x.tipo === 'gasto');
  if (vistaElegida() !== 'negocio') {
    h += tarjetaPresupuesto(r);
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

  h += `<p class="legal">Herramienta educativa. No es asesoría financiera, legal ni fiscal.<br>Tus datos se guardan solo en este teléfono.</p>`;
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
    emo = CAT_GASTO[x.cat] || '📦'; titulo = x.nota || x.cat; sub = x.cat; monto = '-' + dinero(x.monto);
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
        <div class="fila"><span>${CAT_GASTO[c]} ${esc(c)}</span>
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
  campos: Object.keys(CAT_GASTO).map(c => ({ n: c, t: 'dinero', l: CAT_GASTO[c] + ' ' + c })),
  valores: S.presupuesto || {},
  guardar: v => {
    S.presupuesto = {};
    Object.entries(v).forEach(([c, m]) => { if (m > 0) S.presupuesto[c] = m; });
  }
});


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

  h += `<button class="btn ancho" data-a="nuevaDeuda">+ Agregar otra deuda</button>`;
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
    ...campoAmbito()
  ];
  if (gasto) campos.push({ n: 'fuga', t: 'check', l: 'Es una fuga: pude no haberlo gastado' });
  if (!m) campos.push({ n: 'repite', t: 'check', l: 'Se repite cada mes (guardarlo como fijo)' });

  formulario({
    titulo: (m ? 'Editar ' : 'Nuevo ') + tipo,
    campos,
    valores: m || { fecha: hoy(), cuenta: cuentaPorDefecto(), ambito: ambitoPorDefecto() },
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

function abrirAjustes() {
  const ultimo = S.perfil.ultimoRespaldo;
  hoja(`
    ${cabecera('Ajustes')}
    <form id="formAjustes" novalidate>
      <label class="campo"><span>Tu nombre</span><input type="text" name="nombre" value="${esc(S.perfil.nombre)}" maxlength="40"></label>
      <label class="campo"><span>Símbolo de moneda</span><input type="text" name="moneda" value="${esc(S.perfil.moneda)}" maxlength="4"></label>
      <label class="campo"><span>Día en que empezaste los 90 días</span><input type="date" name="inicio" value="${esc(S.perfil.inicio)}" max="${hoy()}"></label>
      <label class="campo"><span>Nombre de tu negocio (opcional)</span><input type="text" name="negocio" value="${esc(S.perfil.negocio)}" maxlength="40" placeholder="Ej. Mi Empresa LLC"></label>
      <p class="ayuda" style="margin-top:-4px">Si tienes negocio, escríbelo aquí. Así puedes separar tus tarjetas, cuentas e ingresos en Personal y Negocio, y ver los dos panoramas.</p>
      <div class="botones"><button type="submit" class="btn principal">Guardar</button></div>
    </form>

    <h2 style="margin-top:22px">Compartir</h2>
    <p class="ayuda">Envía el enlace a quien quieras. Cada persona tiene sus propios datos en su teléfono; nadie ve los tuyos.</p>
    <div class="botones"><button class="btn" data-a="compartir">📤 Compartir la app</button></div>

    <h2 style="margin-top:22px">Respaldo</h2>
    <p class="ayuda">Tus datos viven solo en este teléfono. Guarda una copia cada semana y antes de cambiar de teléfono. ${ultimo ? 'Última copia: ' + esc(fechaCorta(ultimo)) + '.' : 'Todavía no has guardado ninguna.'}</p>
    <div class="botones">
      <button class="btn" data-a="respaldar">⬇️ Guardar copia</button>
      <button class="btn" data-a="restaurar">⬆️ Recuperar copia</button>
    </div>
    <input type="file" id="archivo" accept="application/json,.json" hidden>

    <h2 style="margin-top:22px">Versión</h2>
    <p class="ayuda">Tienes la versión ${VERSION} (beta).${versionNueva ? ' Hay una más nueva: ' + esc(versionNueva) + '.' : ''}</p>
    <div class="botones"><button class="btn" data-a="${versionNueva ? 'actualizar' : 'buscarVersion'}">${versionNueva ? 'Actualizar ahora' : 'Buscar actualización'}</button></div>

    <h2 style="margin-top:22px">Empezar de cero</h2>
    <div class="botones"><button class="btn peligro" id="btnBorrarTodo">Borrar todos mis datos</button></div>

    <p class="legal" style="text-align:left;margin:22px 0 0">
      <b>Aviso.</b> Control Financiero Familiar es una herramienta educativa de La Tribu Los Inquebrantables para organizar tus propios números.
      No es asesoría financiera, legal, fiscal ni de inversión, y no garantiza resultados. Las estimaciones dependen de los datos que tú registras.
      Para decisiones importantes consulta a un profesional autorizado.<br><br>
      <b>Privacidad.</b> Lo que escribes y las fotos de tus facturas se guardan únicamente en este dispositivo. No se envían a ningún servidor y nadie más puede verlos.
      La app no se conecta con tu banco. De tus tarjetas y cuentas solo guarda los últimos 4 números: nunca escribas números completos, contraseñas ni claves.
      La copia de respaldo contiene todos tus datos; guárdala en un lugar que solo tú controles.
    </p>`);

  $('#formAjustes').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target.elements;
    S.perfil.nombre = f.nombre.value.trim();
    S.perfil.moneda = f.moneda.value.trim() || '$';
    if (f.inicio.value) S.perfil.inicio = f.inicio.value;
    S.perfil.negocio = f.negocio.value.trim();
    guardar(); cerrarHoja(); pintar(); aviso('Guardado');
  });

  let confirmado = false;
  $('#btnBorrarTodo').addEventListener('click', e => {
    if (!confirmado) {
      confirmado = true;
      e.target.textContent = 'Se borra todo y no se puede deshacer. Toca otra vez';
      return;
    }
    localStorage.removeItem(CLAVE);
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
 * BIENVENIDA
 ************************************************************/

function bienvenida() {
  formulario({
    titulo: 'Bienvenido 👋',
    ayuda: 'Aquí llevas tus gastos, ingresos, deudas y ahorros, con un reto cada semana durante 90 días. Todo se guarda solo en tu teléfono.',
    campos: [{ n: 'nombre', t: 'texto', l: '¿Cómo te llamas?', ph: 'Tu nombre' }],
    texto: 'Empezar mis 90 días',
    sinCerrar: true,
    guardar: v => {
      S.perfil.nombre = v.nombre;
      S.perfil.inicio = hoy();
    }
  });
}


/************************************************************
 * ARRANQUE
 ************************************************************/

pintar();
if (!S.perfil.inicio) bienvenida();

try {
  const anterior = localStorage.getItem('cff.version');
  if (anterior && anterior !== VERSION) aviso('App actualizada a la versión ' + VERSION);
  localStorage.setItem('cff.version', VERSION);
} catch (e) { /* sin almacenamiento no hay aviso */ }

if (location.protocol.startsWith('http')) buscarVersion();

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
