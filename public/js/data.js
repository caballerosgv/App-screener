// Marco de análisis, universo de empresas y noticias.
// Los datos numéricos son de DEMOSTRACIÓN (edición noviembre 2026) y sirven
// para probar el flujo de análisis. Conecta una API para datos en vivo.

export const MOAT_TYPES = [
  'Marca',
  'Tecnología / patentes',
  'Economías de escala',
  'Costes de cambio',
  'Efecto red',
  'Barreras regulatorias',
  'Recursos únicos'
];

export const FRAMEWORK = [
  {
    id: 1,
    key: 'moat',
    name: 'Modelo de negocio y ventaja competitiva (MOAT)',
    weight: 18,
    subtitle: '¿Por qué esta empresa gana dinero y por qué seguirá ganándolo?',
    desc: 'Antes de mirar ningún múltiplo, entiende cómo genera caja y por qué sus clientes no se van. Un buen negocio se reconoce por márgenes altos y un retorno sobre el capital invertido (ROIC) alto y sostenido en el tiempo.',
    questions: [
      '¿A qué se dedica exactamente la empresa y cuál es su negocio principal?',
      '¿Cómo gana dinero: suscripción, licencia, margen comercial, comisiones, publicidad…?',
      '¿Sus productos son difíciles de sustituir? ¿Cuánto le costaría al cliente cambiar?',
      '¿Tiene una posición dominante (cuota, marca, red, regulación) en su mercado?',
      '¿Puede mantener esas ventajas 10-15 años? ¿Qué podría romperlas?'
    ],
    metrics: ['ROIC 5 años', 'Margen bruto vs. sector', 'Cuota de mercado', 'Retención de clientes', 'Poder de fijación de precios'],
    green: [
      'ROIC superior al 15% durante 5 años o más, sin depender de la deuda.',
      'Sube precios por encima de la inflación sin perder clientes.',
      'Cuota estable o creciente en un sector concentrado.',
      'Coste de cambio alto: integraciones, datos, certificaciones, formación.',
      'Márgenes que aguantan una recesión.'
    ],
    red: [
      'Margen bruto en descenso durante varios años.',
      'Producto fácil de replicar o mercado comoditizado.',
      'Dependencia de un solo cliente, proveedor o contrato regulado.',
      'Competencia que iguala la propuesta con precios más bajos.',
      'Cuota que se pierde ante un entrante tecnológico.'
    ]
  },
  {
    id: 2,
    key: 'management',
    name: 'Calidad de la dirección y asignación de capital',
    weight: 12,
    subtitle: '¿Qué hace la dirección con cada euro que genera el negocio?',
    desc: 'La dirección decide dónde va la caja. Comprueba si ese dinero crea valor (inversión con ROIC alto, recompras a buen precio, dividendos sostenibles) o lo destruye (adquisiciones caras, dilución constante).',
    questions: [
      '¿Quién dirige la empresa y cómo está remunerado?',
      '¿Qué ha hecho con el flujo de caja libre en los últimos 5-10 años?',
      '¿Las recompras se hacen a precios razonables o solo para compensar dilución?',
      '¿La deuda se usa para crecer o para pagar dividendos insostenibles?',
      '¿Hay transparencia y buen trato al accionista minoritario?'
    ],
    metrics: ['FCF destinado a recompras y dividendos', 'Evolución de acciones en circulación', 'ROIC de las adquisiciones', 'Remuneración variable vs. TSR', 'Participación de directivos'],
    green: [
      'Recompras por debajo del valor intrínseco.',
      'Número de acciones estable o decreciente.',
      'Incentivos a 3-5 años ligados a retorno, no solo a tamaño.',
      'Adquisiciones con historial de ROIC por encima del coste de capital.',
      'Comunicación clara y predecible.'
    ],
    red: [
      'Emisión constante de acciones y dilución al accionista.',
      'Adquisiciones grandes pagando primas altas.',
      'Dividendos financiados con deuda.',
      'Cambios frecuentes de estrategia.',
      'Remuneración ligada al crecimiento sin mirar la rentabilidad.'
    ]
  },
  {
    id: 3,
    key: 'growth',
    name: 'Crecimiento',
    weight: 14,
    subtitle: '¿Crece de forma rentable, recurrente y sostenible?',
    desc: 'El crecimiento solo vale si es rentable y repetible. Distingue el crecimiento orgánico del comprado con adquisiciones, y el estructural de un simple ciclo favorable.',
    questions: [
      '¿Cuánto crecen ingresos y beneficio por acción a 5 años?',
      '¿Qué parte del crecimiento es orgánica?',
      '¿Crece por precio, por volumen o por nuevos mercados?',
      '¿Es ingreso recurrente o depende de proyectos puntuales?',
      '¿Cuánto mercado le queda por penetrar?'
    ],
    metrics: ['CAGR de ingresos 5 años', 'CAGR del BPA 5 años', 'Crecimiento orgánico', 'Ingresos recurrentes (NRR)', 'Capex sobre ventas'],
    green: [
      'Ingresos y BPA crecen a doble dígito con márgenes estables o al alza.',
      'El crecimiento orgánico supera al de adquisiciones.',
      'Base de ingresos recurrente elevada.',
      'Mercado amplio con baja penetración.',
      'Reinversión con retornos altos.'
    ],
    red: [
      'Crecer solo comprando otras empresas.',
      'El BPA crece menos que los ingresos por dilución o márgenes.',
      'Desaceleración durante tres trimestres seguidos.',
      'Crecer a base de descuentos o promociones.',
      'Depender de un único producto en fase madura.'
    ]
  },
  {
    id: 4,
    key: 'profitability',
    name: 'Rentabilidad y calidad del beneficio',
    weight: 14,
    subtitle: '¿Cuánto beneficio real genera por cada euro invertido?',
    desc: 'Un ROIC alto y estable es la huella dactilar de un gran negocio. El beneficio contable puede engañar: lo que importa es cuánto de ese beneficio se convierte en caja.',
    questions: [
      '¿El ROIC supera el coste del capital (WACC)?',
      '¿Los márgenes son sostenibles o hay viento de cola cíclico?',
      '¿El beneficio se convierte en caja?',
      '¿Hay partidas extraordinarias que se repiten cada año?',
      '¿La contabilidad es conservadora?'
    ],
    metrics: ['ROIC', 'ROE', 'Margen bruto / operativo / neto', 'Conversión de caja (FCF / beneficio)', 'Accruals'],
    green: [
      'ROIC de 2 a 3 veces el coste de capital.',
      'Margen operativo estable o creciente.',
      'Flujo de caja libre igual o superior al beneficio neto.',
      'Márgenes por encima de la media del sector.',
      'Pocos ajustes contables.'
    ],
    red: [
      'ROIC por debajo del 8-10% o inferior al WACC.',
      'Beneficio sin caja por capital circulante creciente.',
      'Márgenes dependientes del ciclo.',
      'Partidas "no recurrentes" que aparecen todos los años.',
      'Capitalización de gastos para maquillar resultados.'
    ]
  },
  {
    id: 5,
    key: 'balance',
    name: 'Salud financiera',
    weight: 12,
    subtitle: '¿Sobrevive si el crédito se cierra durante dos años?',
    desc: 'La deuda no es mala por sí misma, pero decide quién sobrevive en una crisis. Revisa nivel, vencimientos, tipo de interés y colchón de liquidez.',
    questions: [
      '¿Cuál es la deuda neta sobre EBITDA?',
      '¿Cuántas veces cubre el beneficio operativo a los intereses?',
      '¿Hay vencimientos importantes a corto plazo?',
      '¿La deuda es a tipo fijo o variable?',
      '¿Existe deuda fuera de balance (leases, pensiones, avales)?'
    ],
    metrics: ['Deuda neta / EBITDA', 'Cobertura de intereses', 'Deuda / patrimonio', 'Liquidez corriente', 'Rating de crédito'],
    green: [
      'Deuda neta/EBITDA inferior a 2 veces.',
      'Cobertura de intereses superior a 8 veces.',
      'Caja neta positiva.',
      'Vencimientos escalonados y a tipo fijo.',
      'Rating estable con perspectiva positiva.'
    ],
    red: [
      'Más de 3,5 veces EBITDA con negocio cíclico.',
      'Cobertura de intereses por debajo de 3 veces.',
      'Un vencimiento grande en los próximos 12-24 meses.',
      'Deuda a tipo variable en un entorno de tipos altos.',
      'Covenants ajustados y dependencia del mercado de crédito.'
    ]
  },
  {
    id: 6,
    key: 'valuation',
    name: 'Valoración',
    weight: 14,
    subtitle: '¿Cuánto estás pagando por esa calidad?',
    desc: 'Una gran empresa a mal precio es una mala inversión. Compara los múltiplos con su propia historia, con el sector y, sobre todo, con el crecimiento y la calidad del negocio.',
    questions: [
      '¿Cómo está el PER y el EV/EBITDA frente a su media de 5-10 años?',
      '¿Qué crecimiento está descontando el precio actual?',
      '¿Qué rentabilidad por flujo de caja libre ofrece frente al bono?',
      '¿Hay margen de seguridad?',
      '¿La valoración depende de supuestos heroicos?'
    ],
    metrics: ['PER', 'EV/EBITDA', 'FCF yield', 'EV/FCF', 'PEG', 'DCF por escenarios'],
    green: [
      'Múltiplo por debajo de su media histórica con fundamentales intactos.',
      'FCF yield del 4-5% o superior.',
      'Crecimiento implícito en el precio razonable.',
      'DCF con margen de seguridad del 25-30%.',
      'Valoración atractiva frente a comparables de calidad similar.'
    ],
    red: [
      'Múltiplo muy por encima de su historia y del sector sin aceleración.',
      'Valoración que depende de un solo producto.',
      'FCF yield inferior al 2%.',
      'El precio descuenta un crecimiento perfecto durante una década.',
      'Comprar solo porque "ha caído mucho".'
    ]
  },
  {
    id: 7,
    key: 'risk',
    name: 'Riesgos',
    weight: 8,
    subtitle: '¿Qué puede salir mal y cuánto dolería?',
    desc: 'No se trata de evitar el riesgo, sino de saber si está bien pagado. Identifica los riesgos que pueden romper la tesis y descarta los que no puedes medir.',
    questions: [
      '¿Hay riesgo regulatorio, legal o político?',
      '¿Concentración de clientes, proveedores o geografías?',
      '¿Es un negocio cíclico?',
      '¿Riesgo tecnológico o de disrupción?',
      '¿Riesgo de gobernanza o de accionista de control?',
      '¿Riesgo de divisa?'
    ],
    metrics: ['Concentración top-10 clientes', 'Exposición geográfica', 'Ciclicidad', 'Litigios abiertos', '% de ingresos regulados'],
    green: [
      'Ingresos diversificados por cliente y geografía.',
      'Contratos largos y recurrentes.',
      'Regulación predecible.',
      'Balance fuerte para absorber un shock.',
      'Gobernanza clara y minoritarios protegidos.'
    ],
    red: [
      'Un cliente aporta más del 20% de los ingresos.',
      'Dependencia de una sola patente o fármaco.',
      'Regulación en revisión que cambia el modelo de negocio.',
      'Riesgo político en los mercados clave.',
      'Accionista de control opaco.'
    ]
  },
  {
    id: 8,
    key: 'catalysts',
    name: 'Catalizadores y tesis a 3-5 años',
    weight: 8,
    subtitle: '¿Por qué ahora y qué te haría cambiar de opinión?',
    desc: 'Una buena empresa sin catalizador puede tardar una década en revalorizarse. Define qué evento puede desbloquear valor y qué evidencia invalidaría tu tesis.',
    questions: [
      '¿Qué evento puede desbloquear valor: producto, márgenes, recompras, escisión?',
      '¿Qué está descontando el mercado que tú crees que no ocurrirá?',
      '¿Cuál es el detonante y en qué plazo?',
      '¿Qué evidencia concreta invalidaría la tesis?',
      '¿El equipo tiene historial de ejecución?'
    ],
    metrics: ['Pipeline de productos', 'Plan de recompras', 'Guidance de la empresa', 'Consenso de analistas', 'Sentimiento de mercado'],
    green: [
      'Catalizador concreto con fecha aproximada.',
      'Expectativas del mercado por debajo de tu escenario base.',
      'Equipo con historial probado de ejecución.',
      'Infravaloración clara frente a comparables.',
      'Plan de recompras relevante.'
    ],
    red: [
      'Tesis basada solo en que "está barata".',
      'Catalizador que siempre está a dos años vista.',
      'Consenso muy optimista.',
      'Ejecución fallida repetida.',
      'Sin plan para el exceso de caja.'
    ]
  }
];

export const SCALE = [
  { min: 80, label: 'Excepcional', tone: 'great', desc: 'Negocio de altísima calidad. Merece estudio profundo y seguimiento continuo.' },
  { min: 68, label: 'Sólido', tone: 'good', desc: 'Buen negocio con algún punto débil. Candidata a analizar en detalle.' },
  { min: 55, label: 'Vigilar', tone: 'warn', desc: 'Interesante, pero necesita un precio muy bueno o una mejora clara.' },
  { min: 0, label: 'Descartar por ahora', tone: 'bad', desc: 'No cumple los mínimos de calidad o de precio. Vuelve a revisarla más adelante.' }
];

export const PROCESS = [
  { step: 1, title: 'Filtra el universo', desc: 'Elige mercado (EE. UU. o Europa), sector y tamaño mínimo. Descarta lo que no entiendes.' },
  { step: 2, title: 'Pasa el filtro del MOAT', desc: 'Si no puedes explicar cómo gana dinero y por qué sus clientes se quedan, no sigas.' },
  { step: 3, title: 'Valida con números', desc: 'ROIC, márgenes, crecimiento y balance de los últimos 5-10 años. El relato tiene que cuadrar con las cuentas.' },
  { step: 4, title: 'Ponle precio', desc: 'Compara múltiplos con su historia y con el sector, y calcula un rango de valor, no un número exacto.' },
  { step: 5, title: 'Evalúa riesgos y catalizadores', desc: 'Define qué puede romper la tesis y qué evento puede desbloquear valor en 3-5 años.' },
  { step: 6, title: 'Escribe la tesis y revísala', desc: 'Guarda tus notas, marca qué has verificado y revisa la tesis cada trimestre o cuando cambie algo relevante.' }
];

export const COMPANIES = [
  {
    t: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', country: 'Estados Unidos', region: 'US',
    sector: 'Tecnología', currency: 'USD', price: 231.4, cap: 3480,
    moat: 'Marca + ecosistema', moatRating: 'Wide',
    metrics: { revCagr: 8.2, grossMargin: 46.2, opMargin: 31.5, roic: 52.0, roe: 147.0, netDebtEbitda: -0.4, intCover: 42, per: 31.5, evebitda: 24.3, fcfYield: 3.1, divYield: 0.5 },
    scores: [9.6, 9.2, 6.5, 9.8, 9.4, 5.8, 8.0, 7.0],
    f1: {
      negocio: 'Diseña y vende iPhone, Mac, iPad y wearables, y monetiza una base instalada enorme con servicios digitales.',
      dinero: 'Márgenes altos en hardware y comisiones recurrentes de App Store, iCloud, Apple Pay, publicidad y licencias.',
      sustitucion: 'Ecosistema integrado: cambiar implica perder apps, fotos, reloj, pagos y hábitos. El coste real de cambio es alto.',
      dominio: 'Marca premium global, más de 2.000 millones de dispositivos activos y fuerte poder de negociación con operadores y desarrolladores.',
      durabilidad: 'Muy alta en marca y ecosistema; los puntos débiles son la dependencia de China y la regulación de las tiendas de apps.'
    },
    thesis: 'Máquina de caja con poder de fijación de precios y un negocio de servicios creciente que sostiene márgenes muy altos. La valoración exige que los servicios sigan creciendo y no descuenta del todo el riesgo regulatorio de la App Store.',
    risks: ['Regulación de tiendas de apps y pagos en la UE y EE. UU.', 'Dependencia de China en fabricación y ventas', 'Ciclos de renovación del iPhone cada vez más largos'],
    catalysts: ['Renovación del parque instalado con nuevas funciones de IA', 'Crecimiento de servicios y publicidad', 'Recompras sostenidas del 3-4% del capital al año'],
    notes: [
      'Ecosistema cerrado y marca premium: el moat más claro del sector.',
      'Recompras enormes y acciones en circulación decrecientes.',
      'Servicios crecen a doble dígito, hardware casi plano.',
      'Márgenes muy por encima de la media de hardware.',
      'Caja neta positiva incluso después de pagar dividendos.',
      'Múltiplo exigente para un crecimiento de un dígito.',
      'Riesgo regulatorio acotado pero creciente en Europa.',
      'Catalizador: ciclo de sustitución con IA en el dispositivo.'
    ]
  },
  {
    t: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', country: 'Estados Unidos', region: 'US',
    sector: 'Tecnología', currency: 'USD', price: 468.2, cap: 3480,
    moat: 'Costes de cambio + escala', moatRating: 'Wide',
    metrics: { revCagr: 12.4, grossMargin: 69.4, opMargin: 44.6, roic: 27.5, roe: 33.0, netDebtEbitda: -0.2, intCover: 38, per: 33.8, evebitda: 23.1, fcfYield: 2.9, divYield: 0.8 },
    scores: [9.7, 9.5, 9.0, 9.6, 9.6, 6.2, 8.2, 8.5],
    f1: {
      negocio: 'Software empresarial (Office, Windows, Dynamics), nube (Azure) y un negocio creciente de IA y videojuegos.',
      dinero: 'Suscripciones por usuario, consumo de nube y licencias por volumen con contratos plurianuales.',
      sustitucion: 'Altísimo coste de cambio: identidades, correo, archivos, workflows y formación están integrados en su ecosistema.',
      dominio: 'Cuota dominante en productividad empresarial y segundo proveedor de nube con crecimiento superior al mercado.',
      durabilidad: 'Muy alta; el riesgo es que el capex de IA no genere el retorno esperado a corto plazo.'
    },
    thesis: 'El mejor perfil de calidad del universo: ingresos recurrentes, coste de cambio enorme y exposición directa al gasto empresarial en IA. El precio paga esa calidad, así que el retorno depende de que Azure mantenga el crecimiento.',
    risks: ['Capex de centros de datos muy elevado con retorno incierto', 'Competencia en IA de hiperescalares y modelos abiertos', 'Presión regulatoria en EE. UU. y Europa'],
    catalysts: ['Monetización de Copilot en la base empresarial', 'Crecimiento de Azure por encima del 30%', 'Márgenes operativos al alza por mix de software'],
    notes: [
      'Coste de cambio estructural: quien usa Microsoft no se va.',
      'Dirección con historial excelente de asignación de capital.',
      'Azure crece por encima del mercado cloud.',
      'Márgenes operativos del 44% y en expansión.',
      'Balance con caja neta y cobertura de intereses holgada.',
      'Valoración alta pero apoyada en crecimiento real.',
      'Riesgo: concentración de clientes en pocas grandes cuentas.',
      'Catalizador: adopción empresarial de agentes de IA.'
    ]
  },
  {
    t: 'GOOGL', name: 'Alphabet', exchange: 'NASDAQ', country: 'Estados Unidos', region: 'US',
    sector: 'Tecnología', currency: 'USD', price: 198.6, cap: 2410,
    moat: 'Efecto red + datos', moatRating: 'Wide',
    metrics: { revCagr: 14.1, grossMargin: 58.2, opMargin: 32.0, roic: 28.4, roe: 31.5, netDebtEbitda: -0.6, intCover: 60, per: 24.6, evebitda: 17.8, fcfYield: 3.8, divYield: 0.4 },
    scores: [9.3, 8.0, 8.5, 9.4, 9.8, 7.4, 7.5, 8.0],
    f1: {
      negocio: 'Buscador y publicidad digital, YouTube, Android, Google Cloud y apuestas de largo plazo (Waymo, DeepMind).',
      dinero: 'Publicidad ligada a intención de búsqueda, comisiones de YouTube y Android, y consumo de nube empresarial.',
      sustitucion: 'El hábito de buscar y el grafo de datos son difíciles de replicar, aunque los asistentes de IA abren una vía de sustitución.',
      dominio: 'Cuota de búsqueda superior al 85% y ecosistema Android en la mayoría de móviles del mundo.',
      durabilidad: 'Alta, con la incógnita de si la búsqueda generativa le quita tráfico o le da una nueva capa de monetización.'
    },
    thesis: 'Negocio publicitario con márgenes extraordinarios, caja neta enorme y opcionalidad gratuita en IA, nube y conducción autónoma. Es la gran empresa cotizando a múltiplo más razonable del grupo de mega-cap.',
    risks: ['Cambio de hábito hacia asistentes de IA', 'Costes regulatorios y antitrust', 'Dependencia de la publicidad (más del 75% de ingresos)'],
    catalysts: ['Monetización de resultados de búsqueda con IA', 'Rentabilidad creciente de Google Cloud', 'Posible separación o revalorización de Waymo'],
    notes: [
      'Efecto red del buscador y datos de intención difíciles de copiar.',
      'Dirección correcta: disciplina de costes y recompras.',
      'Crecimiento de dos dígitos con base enorme.',
      'Márgenes operativos por encima del 30%.',
      'Caja neta y capacidad de absorber cualquier shock.',
      'Múltiplo razonable frente a su calidad y crecimiento.',
      'Riesgo antitrust en EE. UU. y Europa.',
      'Catalizador claro: publicidad en respuestas generativas.'
    ]
  },
  {
    t: 'AMZN', name: 'Amazon', exchange: 'NASDAQ', country: 'Estados Unidos', region: 'US',
    sector: 'Consumo discrecional', currency: 'USD', price: 226.8, cap: 2380,
    moat: 'Escala + efecto red', moatRating: 'Wide',
    metrics: { revCagr: 11.6, grossMargin: 48.9, opMargin: 11.2, roic: 16.8, roe: 24.0, netDebtEbitda: 0.3, intCover: 22, per: 34.0, evebitda: 18.4, fcfYield: 2.4, divYield: 0 },
    scores: [9.0, 8.6, 9.2, 7.6, 8.6, 6.6, 7.6, 8.2],
    f1: {
      negocio: 'Comercio electrónico, logística propia, publicidad y AWS, el líder de infraestructura en la nube.',
      dinero: 'Margen en retail, comisiones de vendedores terceros, publicidad de alto margen y consumo de AWS.',
      sustitucion: 'Para el vendedor, AWS y el marketplace son infraestructura crítica; para el consumidor, la rapidez y el catálogo crean hábito.',
      dominio: 'Mayor marketplace occidental y líder de nube con unos 30% de cuota.',
      durabilidad: 'Alta por escala logística y AWS; el retail compite con rivales con estructuras de coste más bajas.'
    },
    thesis: 'Máquina de reinversión: retail de bajo margen que financia dos negocios de margen alto (publicidad y AWS). Cuando el capex se normalice, el flujo de caja libre debería crecer muy por encima del beneficio.',
    risks: ['Capex de IA y logística que presiona el flujo libre', 'Competencia de Temu/Shein en precio', 'Escrutinio regulatorio sobre marketplace'],
    catalysts: ['Mejora del margen de AWS por eficiencia e IA', 'Publicidad creciendo por encima del retail', 'Normalización del capex a partir de 2027'],
    notes: [
      'Escala logística y de compra imposible de replicar a corto plazo.',
      'Dirección con visión de largo plazo y poca dilución.',
      'Crecimiento sólido y con múltiples motores.',
      'Margen operativo en máximos históricos gracias a AWS y publicidad.',
      'Deuda moderada y enorme generación de caja operativa.',
      'Múltiplo alto, pero beneficio deprimido por reinversión.',
      'Riesgo laboral y regulatorio en mercados grandes.',
      'Catalizador: recomposición del beneficio hacia AWS y ads.'
    ]
  },
  {
    t: 'NVDA', name: 'NVIDIA', exchange: 'NASDAQ', country: 'Estados Unidos', region: 'US',
    sector: 'Semiconductores', currency: 'USD', price: 182.4, cap: 4450,
    moat: 'Tecnología + CUDA', moatRating: 'Wide',
    metrics: { revCagr: 58.0, grossMargin: 74.6, opMargin: 62.0, roic: 78.0, roe: 91.0, netDebtEbitda: -0.8, intCover: 120, per: 38.0, evebitda: 30.5, fcfYield: 1.7, divYield: 0.02 },
    scores: [9.4, 9.0, 9.8, 9.7, 9.8, 4.6, 6.2, 8.0],
    f1: {
      negocio: 'Diseña GPUs y sistemas completos (hardware, red y software) para centros de datos, IA, gaming y automoción.',
      dinero: 'Venta de aceleradores y sistemas de altísimo margen, más licencias de software CUDA y redes.',
      sustitucion: 'CUDA y el ecosistema de desarrollo crean un coste de cambio enorme; migrar modelos y código a otro hardware lleva años.',
      dominio: 'Cuota superior al 80% en aceleradores de IA para centros de datos.',
      durabilidad: 'Alta por software y ritmo de innovación, aunque depende de que el gasto en IA se sostenga y de que los clientes no diseñen sus propios chips.'
    },
    thesis: 'El proveedor de referencia de la infraestructura de IA, con márgenes de software y un foso de desarrollo (CUDA) que sus rivales tardarán años en igualar. El riesgo no es la calidad, es el precio y la ciclicidad del gasto en IA.',
    risks: ['Ciclicidad brutal del gasto en centros de datos', 'Clientes que desarrollan silicio propio', 'Restricciones de exportación a China'],
    catalysts: ['Nueva generación de plataformas con más contenido por sistema', 'Crecimiento de inferencia (no solo entrenamiento)', 'Software empresarial de IA (NIM, Omniverse)'],
    notes: [
      'CUDA es el moat: el software retiene al cliente dentro del hardware.',
      'Gestión con ejecución impecable y sin dilución.',
      'Crecimiento histórico, pero con base cada vez más alta.',
      'Márgenes de software en un negocio de hardware.',
      'Caja neta y balance sin tensiones.',
      'Valoración razonable solo si el crecimiento se sostiene.',
      'Riesgo de concentración de clientes y geopolítica.',
      'Catalizador: la inferencia multiplica el mercado.'
    ]
  },
  {
    t: 'V', name: 'Visa', exchange: 'NYSE', country: 'Estados Unidos', region: 'US',
    sector: 'Financiero', currency: 'USD', price: 342.1, cap: 670,
    moat: 'Efecto red', moatRating: 'Wide',
    metrics: { revCagr: 9.8, grossMargin: 80.0, opMargin: 62.5, roic: 29.0, roe: 52.0, netDebtEbitda: 0.4, intCover: 30, per: 31.0, evebitda: 23.0, fcfYield: 3.0, divYield: 0.7 },
    scores: [9.5, 9.3, 7.8, 9.9, 9.0, 6.0, 8.2, 7.2],
    f1: {
      negocio: 'Red de pagos que conecta bancos emisores, comercios y adquirentes en más de 200 países.',
      dinero: 'Comisión por volumen procesado y por transacción, más servicios de valor añadido (fraude, datos, divisas).',
      sustitucion: 'Comercios y bancos están integrados en la red; cambiar requiere renegociar toda la cadena de pagos.',
      dominio: 'Cuota global cercana al 50% de las tarjetas, con una red de dos lados muy difícil de replicar.',
      durabilidad: 'Muy alta; los riesgos son la regulación de tasas y los sistemas de pago en tiempo real.'
    },
    thesis: 'Negocio de peaje: crece con el gasto nominal mundial, tiene márgenes operativos del 60% y casi no necesita capital. Es una de las mejores expresiones de efecto red que existen en bolsa.',
    risks: ['Regulación de tasas de intercambio', 'Competencia de pagos en tiempo real y billeteras', 'Exposición al gasto del consumidor'],
    catalysts: ['Crecimiento del gasto nominal y del comercio electrónico', 'Nuevos flujos (B2B, remesas, stablecoins)', 'Recompras constantes'],
    notes: [
      'Efecto red de dos lados: el moat más limpio del sector financiero.',
      'Recompras agresivas y acciones en circulación decrecientes.',
      'Crecimiento estable de un dígito alto.',
      'Márgenes operativos del 62% y conversión de caja altísima.',
      'Deuda baja para su generación de caja.',
      'Múltiplo alto, coherente con la calidad.',
      'Riesgo regulatorio sobre tasas, manejable.',
      'Catalizador: digitalización de pagos B2B.'
    ]
  },
  {
    t: 'MA', name: 'Mastercard', exchange: 'NYSE', country: 'Estados Unidos', region: 'US',
    sector: 'Financiero', currency: 'USD', price: 561.3, cap: 510,
    moat: 'Efecto red', moatRating: 'Wide',
    metrics: { revCagr: 11.2, grossMargin: 79.0, opMargin: 58.0, roic: 34.0, roe: 68.0, netDebtEbitda: 0.9, intCover: 26, per: 33.0, evebitda: 24.0, fcfYield: 2.8, divYield: 0.6 },
    scores: [9.5, 9.3, 8.0, 9.9, 9.2, 6.1, 8.2, 7.4],
    f1: {
      negocio: 'Segunda gran red de pagos del mundo, con foco en servicios de valor añadido y mercados emergentes.',
      dinero: 'Tasas por transacción y por volumen, más analítica, prevención de fraude y consultoría.',
      sustitucion: 'Integración con emisores y comercios, y aceptación universal como estándar.',
      dominio: 'Cuota global en torno al 30-35%, con crecimiento más rápido que Visa en varios mercados.',
      durabilidad: 'Muy alta, similar a Visa, con algo más de exposición a mercados emergentes.'
    },
    thesis: 'Casi el mismo negocio que Visa con un poco más de crecimiento y de exposición internacional. La comparación entre ambas es un buen ejercicio de valoración relativa.',
    risks: ['Regulación de tasas de intercambio', 'Riesgo de divisa en mercados emergentes', 'Competencia de nuevas redes de pago'],
    catalysts: ['Crecimiento en mercados emergentes', 'Servicios de valor añadido por encima del 15%', 'Recompras y margen operativo al alza'],
    notes: [
      'Red de pagos con efecto red y aceptación universal.',
      'Asignación de capital muy disciplinada.',
      'Crece algo más rápido que Visa, con más riesgo de divisa.',
      'Márgenes del 58% con tendencia estable.',
      'Apalancamiento moderado y bien cubierto.',
      'Múltiplo ligeramente superior al de Visa.',
      'Riesgo regulatorio compartido con el sector.',
      'Catalizador: servicios de valor añadido.'
    ]
  },
  {
    t: 'COST', name: 'Costco', exchange: 'NASDAQ', country: 'Estados Unidos', region: 'US',
    sector: 'Consumo básico', currency: 'USD', price: 912.5, cap: 405,
    moat: 'Escala + modelo de socio', moatRating: 'Wide',
    metrics: { revCagr: 8.4, grossMargin: 12.8, opMargin: 3.9, roic: 22.0, roe: 31.0, netDebtEbitda: 0.2, intCover: 45, per: 49.0, evebitda: 29.0, fcfYield: 2.0, divYield: 0.5 },
    scores: [9.2, 9.0, 7.6, 8.8, 9.4, 4.8, 8.0, 6.8],
    f1: {
      negocio: 'Cadena de almacenes de descuento con membresía anual, surtido limitado y márgenes muy bajos.',
      dinero: 'Vende casi a coste para generar tráfico y gana la mayor parte del beneficio con la cuota de socio.',
      sustitucion: 'La cuota crea compromiso y el ahorro percibido es difícil de igualar; el cliente renueva por inercia y precio.',
      dominio: 'Líder de clubes de compra, con renovaciones de membresía superiores al 90%.',
      durabilidad: 'Muy alta: el modelo lleva décadas funcionando igual, con riesgo en márgenes de proveedores y expansión.'
    },
    thesis: 'Modelo minorista más predecible y resistente del sector: ingresos por cuota de altísimo margen y clientes que renuevan. La calidad es indiscutible; el problema histórico ha sido el precio.',
    risks: ['Valoración muy exigente', 'Compresión de márgenes por inflación de costes', 'Crecimiento dependiente de nuevas aperturas'],
    catalysts: ['Subida de la cuota de membresía', 'Expansión internacional', 'Crecimiento del canal digital'],
    notes: [
      'La cuota de socio es el verdadero negocio y el moat.',
      'Dirección conservadora y muy alineada.',
      'Crecimiento moderado pero muy constante.',
      'Márgenes operativos bajos por diseño, ROIC del 22%.',
      'Balance prácticamente sin deuda.',
      'Uno de los múltiplos más altos del consumo básico.',
      'Riesgo bajo, pero la valoración no perdona.',
      'Catalizador: nueva subida de cuota y expansión.'
    ]
  },
  {
    t: 'MCO', name: "Moody's", exchange: 'NYSE', country: 'Estados Unidos', region: 'US',
    sector: 'Financiero', currency: 'USD', price: 478.0, cap: 86,
    moat: 'Barreras regulatorias + marca', moatRating: 'Wide',
    metrics: { revCagr: 8.0, grossMargin: 72.0, opMargin: 44.0, roic: 24.0, roe: 62.0, netDebtEbitda: 1.6, intCover: 14, per: 36.0, evebitda: 24.0, fcfYield: 2.9, divYield: 0.9 },
    scores: [9.3, 9.1, 7.0, 9.6, 8.4, 6.6, 7.4, 6.6],
    f1: {
      negocio: 'Agencia de calificación crediticia y proveedor de datos y analítica para el mercado financiero.',
      dinero: 'Cobra al emisor por calificar deuda y vende suscripciones de datos y modelos a inversores.',
      sustitucion: 'La regulación exige calificaciones de agencias reconocidas y el mercado usa sus escalas como estándar.',
      dominio: 'Oligopolio con S&P y Fitch; cuota muy estable durante décadas.',
      durabilidad: 'Alta; el riesgo es regulatorio (conflicto de interés) y la ciclicidad de la emisión de deuda.'
    },
    thesis: 'Oligopolio regulado con márgenes de software y mucho poder de fijación de precios. La emisión de deuda es cíclica, pero la parte de datos crece de forma recurrente.',
    risks: ['Ciclicidad del volumen de emisión de deuda', 'Regulación sobre conflicto de interés', 'Competencia de datos alternativos'],
    catalysts: ['Recuperación del ciclo de emisión', 'Crecimiento de Moody\u2019s Analytics', 'Recompras y márgenes al alza'],
    notes: [
      'Oligopolio regulado: barreras de entrada casi infranqueables.',
      'Historial excelente de asignación de capital.',
      'Crecimiento moderado y muy ligado al ciclo de crédito.',
      'Márgenes operativos del 44% con alta conversión a caja.',
      'Deuda controlada, aunque mayor que en Visa o Mastercard.',
      'Valoración razonable para la calidad del negocio.',
      'Riesgo regulatorio estructural y conocido.',
      'Catalizador: ciclo de emisión y datos.'
    ]
  },
  {
    t: 'ADBE', name: 'Adobe', exchange: 'NASDAQ', country: 'Estados Unidos', region: 'US',
    sector: 'Tecnología', currency: 'USD', price: 392.4, cap: 168,
    moat: 'Costes de cambio', moatRating: 'Wide',
    metrics: { revCagr: 11.0, grossMargin: 89.0, opMargin: 36.0, roic: 32.0, roe: 38.0, netDebtEbitda: 0.6, intCover: 30, per: 21.0, evebitda: 14.5, fcfYield: 5.6, divYield: 0 },
    scores: [8.6, 8.2, 7.2, 9.5, 9.2, 5.6, 7.0, 6.4],
    f1: {
      negocio: 'Software de creación y gestión de contenido digital (Photoshop, Illustrator, Acrobat, Experience Cloud).',
      dinero: 'Suscripciones mensuales por usuario y contratos empresariales de marketing digital.',
      sustitucion: 'Los archivos, flujos de trabajo y formación en su formato tienen un coste de cambio alto, aunque la IA generativa está bajando la barrera.',
      dominio: 'Estándar de facto en creatividad profesional durante más de 30 años.',
      durabilidad: 'Media-alta: el moat es real, pero la IA generativa puede redefinir el trabajo creativo.'
    },
    thesis: 'Negocio de suscripción con márgenes brutos del 89% y flujo de caja libre elevado. El mercado descuenta que la IA generativa le quita relevancia, lo que deja un múltiplo bajo para su calidad histórica.',
    risks: ['Disrupción por herramientas de IA generativa', 'Competencia de suites más baratas', 'Saturación de asientos en creativos'],
    catalysts: ['Monetización de Firefly', 'Recuperación del crecimiento de Digital Media', 'Recompras con el exceso de caja'],
    notes: [
      'Estándar de la industria con costes de cambio altos.',
      'Dirección con recompras muy agresivas y buen historial.',
      'Crecimiento desacelerando por saturación y competencia.',
      'Márgenes brutos del 89%, difícilmente superables.',
      'Caja neta y generación de flujo muy sólida.',
      'Múltiplo castigado: el mercado teme a la IA.',
      'Riesgo tecnológico real, no solo de narrativa.',
      'Catalizador: Firefly si logra monetizar.'
    ]
  },
  {
    t: 'LLY', name: 'Eli Lilly', exchange: 'NYSE', country: 'Estados Unidos', region: 'US',
    sector: 'Salud', currency: 'USD', price: 842.0, cap: 800,
    moat: 'Patentes + I+D', moatRating: 'Wide',
    metrics: { revCagr: 22.0, grossMargin: 81.0, opMargin: 34.0, roic: 26.0, roe: 68.0, netDebtEbitda: 1.1, intCover: 20, per: 34.0, evebitda: 26.0, fcfYield: 2.2, divYield: 0.7 },
    scores: [8.8, 8.8, 9.4, 9.4, 8.4, 4.4, 6.6, 8.6],
    f1: {
      negocio: 'Farmacéutica centrada en diabetes, obesidad, oncología y sistema nervioso central.',
      dinero: 'Venta de medicamentos patentados con márgenes muy altos y ciclos de exclusividad de años.',
      sustitucion: 'En obesidad y diabetes sus fármacos son líderes clínicos; cambiar depende de la eficacia y del reembolso, no del precio.',
      dominio: 'Líder en la clase GLP-1, el mercado farmacéutico de mayor crecimiento.',
      durabilidad: 'Alta mientras dure la patente y la ventaja clínica; el riesgo es la competencia y la presión de precios de aseguradoras.'
    },
    thesis: 'La mayor oportunidad de crecimiento del sector salud gracias a los fármacos GLP-1, con una cartera que va más allá de la obesidad. El precio ya descuenta buena parte del éxito, y la capacidad de fabricación es la variable clave.',
    risks: ['Presión de precios de aseguradoras y gobiernos', 'Competencia de otros GLP-1', 'Cuellos de botella de fabricación'],
    catalysts: ['Ampliación de indicaciones (cardiovascular, hígado, Alzheimer)', 'Aumento de capacidad productiva', 'Nuevos datos de eficacia frente a competidores'],
    notes: [
      'Ventaja clínica y patentes sólidas en GLP-1.',
      'Dirección con fuerte inversión en I+D.',
      'Crecimiento superior al 20% con base creciente.',
      'Márgenes brutos del 81%.',
      'Balance sano, con deuda baja para el sector.',
      'Múltiplo alto que exige ejecución perfecta.',
      'Riesgo político por el precio de los medicamentos.',
      'Catalizador: nuevas indicaciones y capacidad.'
    ]
  },
  {
    t: 'JNJ', name: 'Johnson & Johnson', exchange: 'NYSE', country: 'Estados Unidos', region: 'US',
    sector: 'Salud', currency: 'USD', price: 168.2, cap: 405,
    moat: 'Marca + patentes', moatRating: 'Narrow',
    metrics: { revCagr: 4.2, grossMargin: 68.0, opMargin: 24.0, roic: 14.0, roe: 22.0, netDebtEbitda: 1.0, intCover: 18, per: 17.0, evebitda: 12.0, fcfYield: 6.2, divYield: 3.1 },
    scores: [8.4, 7.8, 4.6, 8.6, 9.4, 7.2, 7.8, 5.6],
    f1: {
      negocio: 'Farmacéutica y dispositivos médicos tras separar el negocio de consumo (Kenvue).',
      dinero: 'Medicamentos patentados, inmunología, oncología y venta de equipos e implantes médicos.',
      sustitucion: 'Los dispositivos están integrados en protocolos quirúrgicos; los fármacos dependen de patentes y de la relación con prescriptores.',
      dominio: 'Posiciones líderes en inmunología y cirugía, sin dominio absoluto en ninguna área.',
      durabilidad: 'Media: cartera diversificada y balance fuerte, pero con patentes que expiran y litigios relevantes.'
    },
    thesis: 'Perfil defensivo clásico: caja abundante, dividendo creciente durante décadas y balance sólido. El atractivo está en el precio y el dividendo, no en el crecimiento.',
    risks: ['Litigios por talco', 'Pérdida de exclusividad de fármacos clave', 'Crecimiento estructural bajo'],
    catalysts: ['Resolución de litigios', 'Datos de la cartera oncológica', 'Recompras con la caja libre'],
    notes: [
      'Marca y cartera amplia, pero sin dominio claro.',
      'Gestión conservadora y muy enfocada al dividendo.',
      'Crecimiento bajo, típico de farmacéutica madura.',
      'Márgenes sólidos y ROIC por encima del coste de capital.',
      'Balance fuerte con cobertura de intereses holgada.',
      'Valoración barata y dividendo superior al 3%.',
      'Riesgo de litigios, difícil de cuantificar.',
      'Catalizador: resolución legal y recompras.'
    ]
  },
  {
    t: 'ASML', name: 'ASML Holding', exchange: 'Euronext Ámsterdam', country: 'Países Bajos', region: 'EU',
    sector: 'Semiconductores', currency: 'EUR', price: 742.0, cap: 292,
    moat: 'Monopolio tecnológico', moatRating: 'Wide',
    metrics: { revCagr: 18.0, grossMargin: 52.0, opMargin: 32.0, roic: 28.0, roe: 48.0, netDebtEbitda: -1.2, intCover: 60, per: 30.0, evebitda: 22.0, fcfYield: 3.2, divYield: 0.9 },
    scores: [9.6, 9.4, 8.8, 9.6, 9.4, 6.0, 6.8, 8.4],
    f1: {
      negocio: 'Fabricante de máquinas de litografía para producir chips, con monopolio en la tecnología EUV.',
      dinero: 'Vende máquinas de decenas o cientos de millones de euros y factura servicios y actualizaciones recurrentes.',
      sustitucion: 'No hay alternativa real en EUV: sin ASML no se fabrican chips de vanguardia.',
      dominio: 'Cuota del 100% en EUV y más del 80% en litografía avanzada.',
      durabilidad: 'Muy alta por patentes, know-how e inversión necesaria; el riesgo es el ciclo de capex de los fabricantes de chips.'
    },
    thesis: 'Cuasi-monopolio tecnológico europeo con clientes cautivos y una ventaja de ingeniería que lleva 20 años construyéndose. La acción es cíclica y política, pero la posición es casi insustituible.',
    risks: ['Controles de exportación a China', 'Ciclicidad del capex de semiconductores', 'Concentración extrema de clientes'],
    catalysts: ['Adopción de High-NA EUV', 'Recuperación del ciclo de memoria', 'Crecimiento de ingresos por servicios'],
    notes: [
      'Monopolio real en EUV: el moat más fuerte de Europa.',
      'Dirección con décadas de ejecución tecnológica.',
      'Crecimiento alto, pero muy cíclico.',
      'Márgenes brutos del 52% y ROIC del 28%.',
      'Caja neta positiva y cobertura enorme.',
      'Múltiplo exigente, aunque menor que su crecimiento.',
      'Riesgo geopolítico por China y exportaciones.',
      'Catalizador: High-NA y ciclo de memoria.'
    ]
  },
  {
    t: 'MC.PA', name: 'LVMH', exchange: 'Euronext París', country: 'Francia', region: 'EU',
    sector: 'Consumo discrecional', currency: 'EUR', price: 612.0, cap: 305,
    moat: 'Marca de lujo', moatRating: 'Wide',
    metrics: { revCagr: 12.0, grossMargin: 68.0, opMargin: 26.0, roic: 18.0, roe: 27.0, netDebtEbitda: 1.4, intCover: 16, per: 22.0, evebitda: 13.5, fcfYield: 4.0, divYield: 2.1 },
    scores: [9.4, 8.4, 7.0, 8.8, 7.8, 6.6, 6.8, 7.0],
    f1: {
      negocio: 'Conglomerado de lujo: moda y marroquinería, vinos y licores, perfumes, relojes y distribución selectiva.',
      dinero: 'Venta de productos de lujo con márgenes muy altos y control estricto de la distribución y del precio.',
      sustitucion: 'Una marca de lujo no se sustituye por precio: sustituirla implica renunciar a estatus y a un código cultural.',
      dominio: 'Líder mundial del lujo con más de 75 marcas, varias de ellas icónicas.',
      durabilidad: 'Alta por marcas centenarias, aunque el sector depende del ciclo del consumo chino y del turismo.'
    },
    thesis: 'Cartera de marcas irrepetibles con poder de fijación de precios y márgenes altos. La tesis depende de la recuperación del consumo de lujo en China y de la capacidad de mantener el atractivo de las marcas.',
    risks: ['Desaceleración del consumo en China', 'Dependencia del turismo y del gasto aspiracional', 'Riesgo de dilución de marca por sobreprecio'],
    catalysts: ['Recuperación del consumo chino', 'Mejora del mix de producto', 'Normalización de inventarios en distribución'],
    notes: [
      'Marcas centenarias con pricing power excepcional.',
      'Familia controladora con visión de largo plazo.',
      'Crecimiento cíclico, hoy en fase de normalización.',
      'Márgenes altos, pero por debajo de los máximos de 2023.',
      'Deuda moderada para su generación de caja.',
      'Valoración ya descuenta una recuperación parcial.',
      'Riesgo de concentración en Asia.',
      'Catalizador: vuelta del consumidor chino.'
    ]
  },
  {
    t: 'OR.PA', name: "L'Oréal", exchange: 'Euronext París', country: 'Francia', region: 'EU',
    sector: 'Consumo básico', currency: 'EUR', price: 372.0, cap: 199,
    moat: 'Marca + escala', moatRating: 'Wide',
    metrics: { revCagr: 7.8, grossMargin: 74.0, opMargin: 20.0, roic: 20.0, roe: 30.0, netDebtEbitda: 0.3, intCover: 40, per: 28.0, evebitda: 18.0, fcfYield: 3.4, divYield: 1.9 },
    scores: [9.0, 8.6, 5.8, 9.0, 9.2, 6.2, 7.6, 6.0],
    f1: {
      negocio: 'Mayor grupo cosmético del mundo: cuidado del cabello, piel, maquillaje, perfumes y dermatología.',
      dinero: 'Venta de productos de consumo y de lujo con márgenes altos, apoyada en publicidad y distribución global.',
      sustitucion: 'Las marcas construidas durante décadas y la confianza en la fórmula son difíciles de replicar; el consumidor es cambiante pero la cartera es amplia.',
      dominio: 'Líder mundial con cuota cercana al 15% en un mercado fragmentado.',
      durabilidad: 'Alta por cartera de marcas y escala publicitaria; el riesgo es la desaceleración del consumo y la competencia de marcas nicho.'
    },
    thesis: 'Franquicia de consumo con marcas muy fuertes, escala publicitaria y crecimiento constante. Poco emocionante, pero muy predecible; el atractivo aparece cuando el múltiplo se comprime.',
    risks: ['Desaceleración del mercado cosmético', 'Competencia de marcas independientes', 'Exposición a China y a viajes'],
    catalysts: ['Recuperación del mercado chino', 'Crecimiento de dermatología', 'Mejora de márgenes por mix'],
    notes: [
      'Cartera de marcas y escala publicitaria como moat.',
      'Gestión familiar con historial muy largo.',
      'Crecimiento moderado y muy estable.',
      'Márgenes brutos del 74%, de los más altos del consumo.',
      'Balance con caja neta positiva.',
      'Múltiplo alto para el crecimiento actual.',
      'Riesgo bajo, pero con exposición a China.',
      'Catalizador: normalización del consumo asiático.'
    ]
  },
  {
    t: 'RMS.PA', name: 'Hermès', exchange: 'Euronext París', country: 'Francia', region: 'EU',
    sector: 'Consumo discrecional', currency: 'EUR', price: 2280.0, cap: 240,
    moat: 'Marca + escasez', moatRating: 'Wide',
    metrics: { revCagr: 16.0, grossMargin: 71.0, opMargin: 41.0, roic: 26.0, roe: 32.0, netDebtEbitda: -1.0, intCover: 80, per: 48.0, evebitda: 30.0, fcfYield: 1.8, divYield: 0.8 },
    scores: [9.7, 9.2, 7.6, 9.4, 9.6, 4.4, 7.2, 6.4],
    f1: {
      negocio: 'Maison de lujo con marroquinería, seda, relojería y prêt-à-porter de producción artesanal y limitada.',
      dinero: 'Vende producto escaso a precios muy altos, con listas de espera y sin descuentos.',
      sustitucion: 'La marca y la escasez deliberada hacen que el producto no tenga sustituto directo.',
      dominio: 'Referencia absoluta del lujo silencioso, con márgenes operativos superiores al 40%.',
      durabilidad: 'Muy alta por control familiar, artesanía y gestión de la escasez; el límite es la valoración.'
    },
    thesis: 'El negocio de lujo de mayor calidad del mundo: márgenes del 41%, caja neta y crecimiento de dos dígitos sin perder exclusividad. El problema nunca ha sido la empresa, sino el precio de la acción.',
    risks: ['Valoración extremadamente alta', 'Desaceleración del lujo aspiracional', 'Riesgo de marca por crecimiento demasiado rápido'],
    catalysts: ['Aumentos de capacidad productiva', 'Crecimiento en mercados nuevos', 'Subidas de precio anuales'],
    notes: [
      'Escasez y marca: el moat más puro del lujo.',
      'Control familiar con horizonte de décadas.',
      'Crecimiento de dos dígitos incluso en crisis.',
      'Márgenes operativos del 41%, los más altos del sector.',
      'Caja neta y sin tensiones de balance.',
      'Valoración muy exigente, casi sin margen de error.',
      'Riesgo bajo de negocio, alto de múltiplo.',
      'Catalizador: capacidad y nuevos mercados.'
    ]
  },
  {
    t: 'SAP', name: 'SAP', exchange: 'Xetra', country: 'Alemania', region: 'EU',
    sector: 'Tecnología', currency: 'EUR', price: 208.0, cap: 243,
    moat: 'Costes de cambio', moatRating: 'Wide',
    metrics: { revCagr: 9.0, grossMargin: 73.0, opMargin: 26.0, roic: 16.0, roe: 20.0, netDebtEbitda: 0.6, intCover: 25, per: 32.0, evebitda: 20.0, fcfYield: 3.6, divYield: 1.2 },
    scores: [8.8, 8.8, 8.4, 8.6, 8.8, 6.4, 7.8, 7.6],
    f1: {
      negocio: 'Software de gestión empresarial (ERP), nube, analítica y soluciones de IA para procesos de negocio.',
      dinero: 'Suscripciones cloud, licencias y mantenimiento de instalaciones existentes.',
      sustitucion: 'Migrar un ERP es un proyecto de años y millones de euros; el coste de cambio es enorme.',
      dominio: 'Líder mundial de ERP con una base instalada que incluye la mayoría de grandes empresas.',
      durabilidad: 'Muy alta por integración en procesos críticos; el riesgo es la migración a la nube y la competencia de suites modernas.'
    },
    thesis: 'Uno de los mejores negocios de software de Europa: ingresos recurrentes, clientes atrapados y una transición a la nube que debería elevar márgenes y calidad del ingreso.',
    risks: ['Transición a la nube más lenta de lo previsto', 'Competencia de suites nativas y de bajo coste', 'Exposición al gasto empresarial europeo'],
    catalysts: ['Aceleración del crecimiento cloud', 'Expansión de margen por mix', 'Monetización de IA empresarial'],
    notes: [
      'ERP crítico: coste de cambio altísimo.',
      'Dirección enfocada en nube y eficiencia.',
      'Crecimiento de un dígito alto y recurrente.',
      'Margen operativo con recorrido al alza.',
      'Deuda baja y flujo de caja muy estable.',
      'Múltiplo alto, pero justificado por recurrencia.',
      'Riesgo de ejecución en la migración cloud.',
      'Catalizador: IA integrada en procesos.'
    ]
  },
  {
    t: 'SIE.DE', name: 'Siemens', exchange: 'Xetra', country: 'Alemania', region: 'EU',
    sector: 'Industrial', currency: 'EUR', price: 224.0, cap: 176,
    moat: 'Tecnología + instalado', moatRating: 'Narrow',
    metrics: { revCagr: 6.0, grossMargin: 38.0, opMargin: 13.0, roic: 14.0, roe: 18.0, netDebtEbitda: 1.2, intCover: 12, per: 19.0, evebitda: 12.0, fcfYield: 4.8, divYield: 2.4 },
    scores: [8.0, 8.2, 6.0, 7.6, 7.8, 7.4, 7.4, 7.0],
    f1: {
      negocio: 'Automatización industrial, digitalización de fábricas, trenes, energía y equipamiento médico (cotiza Siemens Healthineers aparte).',
      dinero: 'Venta de equipos, software industrial y servicios de mantenimiento con contratos de larga duración.',
      sustitucion: 'Las fábricas están diseñadas alrededor de su hardware y software; sustituir la automatización implica parar la producción.',
      dominio: 'Líder europeo en automatización, con una base instalada enorme.',
      durabilidad: 'Media-alta por base instalada y servicio, con exposición clara al ciclo industrial europeo.'
    },
    thesis: 'Conglomerado industrial en transformación hacia software y automatización, con exposición a la electrificación y a la reindustrialización. Cotiza a múltiplo razonable frente a sus comparables estadounidenses.',
    risks: ['Ciclo industrial europeo débil', 'Exposición a China', 'Complejidad del conglomerado'],
    catalysts: ['Crecimiento de software industrial', 'Electrificación y centros de datos', 'Simplificación de la estructura'],
    notes: [
      'Base instalada en automatización como ventaja.',
      'Gestión centrada en márgenes y separación de negocios.',
      'Crecimiento moderado y cíclico.',
      'Márgenes medios, con mejora gradual.',
      'Deuda moderada y buena conversión de caja.',
      'Valoración atractiva frente a comparables.',
      'Riesgo cíclico y geopolítico elevado.',
      'Catalizador: electrificación y software.'
    ]
  },
  {
    t: 'NESN.SW', name: 'Nestlé', exchange: 'SIX', country: 'Suiza', region: 'EU',
    sector: 'Consumo básico', currency: 'CHF', price: 78.5, cap: 203,
    moat: 'Marca + distribución', moatRating: 'Narrow',
    metrics: { revCagr: 3.0, grossMargin: 46.0, opMargin: 17.0, roic: 12.0, roe: 24.0, netDebtEbitda: 2.2, intCover: 10, per: 18.0, evebitda: 12.5, fcfYield: 5.4, divYield: 3.6 },
    scores: [8.6, 7.8, 3.6, 8.2, 8.4, 7.6, 7.4, 5.4],
    f1: {
      negocio: 'Mayor grupo alimentario del mundo: café, nutrición infantil, mascotas, agua y alimentos preparados.',
      dinero: 'Venta de marcas de consumo masivo con márgenes medios y fuerte presencia en distribución.',
      sustitucion: 'Las marcas tienen preferencia, pero el consumidor cambia de producto con relativa facilidad si el precio sube mucho.',
      dominio: 'Líder global en café (Nespresso) y nutrición de mascotas, mercados concentrados.',
      durabilidad: 'Media: marcas sólidas con crecimiento bajo y presión de marcas blancas.'
    },
    thesis: 'Negocio defensivo con dividendo alto y marcas líderes, en plena renovación de dirección. La tesis es de rentabilidad y dividendo, no de crecimiento: si el nuevo equipo recupera volumen, hay margen de revalorización.',
    risks: ['Pérdida de volumen frente a marcas blancas', 'Crecimiento muy bajo', 'Exposición a divisas y a costes de materias primas'],
    catalysts: ['Plan de recuperación de volumen', 'Desinversiones de negocios de bajo margen', 'Mejora del margen operativo'],
    notes: [
      'Marcas líderes, pero con poder de fijación de precios limitado.',
      'Nueva dirección con mandato de acelerar el crecimiento.',
      'Crecimiento muy bajo, el punto más débil.',
      'Márgenes del 17%, con recorrido de mejora.',
      'Deuda algo elevada para el sector.',
      'Valoración barata y dividendo del 3,6%.',
      'Riesgo de ejecución del plan de recuperación.',
      'Catalizador: vuelta del volumen.'
    ]
  },
  {
    t: 'NOVO-B.CO', name: 'Novo Nordisk', exchange: 'Copenhague', country: 'Dinamarca', region: 'EU',
    sector: 'Salud', currency: 'DKK', price: 342.0, cap: 245,
    moat: 'Patentes + I+D', moatRating: 'Wide',
    metrics: { revCagr: 19.0, grossMargin: 84.0, opMargin: 44.0, roic: 42.0, roe: 78.0, netDebtEbitda: 0.1, intCover: 45, per: 17.0, evebitda: 11.0, fcfYield: 5.8, divYield: 2.2 },
    scores: [9.2, 8.4, 8.6, 9.2, 9.2, 6.0, 6.4, 8.0],
    f1: {
      negocio: 'Farmacéutica especializada en diabetes, obesidad y enfermedades raras, con liderazgo histórico en insulina.',
      dinero: 'Venta de medicamentos patentados con márgenes brutos del 84% y crecimiento apoyado en GLP-1.',
      sustitucion: 'Sus moléculas son líderes clínicas y el paciente no cambia de tratamiento por precio.',
      dominio: 'Líder en diabetes y uno de los dos grandes de obesidad a nivel mundial.',
      durabilidad: 'Alta por patentes e historial clínico, aunque la competencia en GLP-1 es feroz y el precio se presiona.'
    },
    thesis: 'Líder europeo en el mercado farmacéutico de mayor crecimiento, con márgenes del 44% y ROIC del 42%. El castigo bursátil por la competencia en GLP-1 ha dejado un múltiplo muy inferior al de su calidad.',
    risks: ['Competencia intensa en GLP-1', 'Presión de precios en EE. UU.', 'Dependencia de pocas moléculas'],
    catalysts: ['Nuevos datos de eficacia y presentaciones orales', 'Ampliación de indicaciones', 'Recuperación de cuota en farmacia'],
    notes: [
      'Liderazgo clínico en diabetes y obesidad.',
      'Asignación de capital muy rentable y sin dilución.',
      'Crecimiento alto, aunque desacelerando.',
      'Márgenes brutos del 84% y ROIC del 42%.',
      'Caja neta positiva y balance muy fuerte.',
      'Valoración muy castigada frente a su historial.',
      'Riesgo competitivo y regulatorio real.',
      'Catalizador: datos de la próxima generación.'
    ]
  },
  {
    t: 'ADYEN.AS', name: 'Adyen', exchange: 'Euronext Ámsterdam', country: 'Países Bajos', region: 'EU',
    sector: 'Financiero', currency: 'EUR', price: 1420.0, cap: 44,
    moat: 'Tecnología + costes de cambio', moatRating: 'Wide',
    metrics: { revCagr: 24.0, grossMargin: 60.0, opMargin: 23.0, roic: 22.0, roe: 26.0, netDebtEbitda: -2.0, intCover: 90, per: 42.0, evebitda: 28.0, fcfYield: 2.4, divYield: 0 },
    scores: [8.4, 8.6, 8.8, 8.4, 9.4, 5.8, 6.8, 7.8],
    f1: {
      negocio: 'Plataforma única de pagos para grandes comercios, con adquirencia, procesamiento y gestión de riesgo integrados.',
      dinero: 'Cobra un porcentaje del volumen procesado más tarifas por servicios añadidos.',
      sustitucion: 'Integrar una pasarela de pagos en una gran empresa lleva meses y toca el checkout; el coste de cambio es alto.',
      dominio: 'Proveedor de referencia para grandes comercios globales, con crecimiento superior al mercado.',
      durabilidad: 'Alta por tecnología propia y escala, con riesgo de competencia de procesadores y de presión de precios.'
    },
    thesis: 'Crecimiento alto, caja neta y márgenes en expansión en un mercado enorme. La valoración sigue siendo exigente y la acción es muy volátil ante cualquier decepción de crecimiento.',
    risks: ['Desaceleración del crecimiento del volumen', 'Competencia y presión de precios', 'Volatilidad bursátil extrema'],
    catalysts: ['Expansión de márgenes por escala', 'Entrada en nuevos segmentos (plataformas, banca)', 'Crecimiento del volumen en EE. UU.'],
    notes: [
      'Plataforma propia y costes de cambio en el checkout.',
      'Fundadores con control y enfoque a largo plazo.',
      'Crecimiento del 20% o más con base creciente.',
      'Margen operativo en expansión hacia el 23%.',
      'Caja neta y sin deuda relevante.',
      'Múltiplo muy alto: exige ejecución perfecta.',
      'Riesgo de competencia de grandes procesadores.',
      'Catalizador: apalancamiento operativo.'
    ]
  },
  {
    t: 'AIR.PA', name: 'Airbus', exchange: 'Euronext París', country: 'Francia', region: 'EU',
    sector: 'Industrial', currency: 'EUR', price: 186.0, cap: 147,
    moat: 'Duopolio + escala', moatRating: 'Wide',
    metrics: { revCagr: 7.0, grossMargin: 20.0, opMargin: 11.0, roic: 15.0, roe: 24.0, netDebtEbitda: -0.4, intCover: 30, per: 26.0, evebitda: 16.0, fcfYield: 4.4, divYield: 1.4 },
    scores: [8.6, 8.0, 7.4, 8.2, 7.8, 7.0, 6.6, 7.6],
    f1: {
      negocio: 'Fabricante de aviones comerciales, helicópteros, defensa y espacio.',
      dinero: 'Venta de aeronaves con pedidos a 10 años, más ingresos recurrentes de repuestos y mantenimiento.',
      sustitucion: 'Comprar un avión implica 20 años de relación: formación, repuestos y certificación. Cambiar de fabricante es carísimo.',
      dominio: 'Duopolio global con Boeing, con más de la mitad de los pedidos nuevos.',
      durabilidad: 'Alta por duopolio y cartera de pedidos, con riesgo de ejecución industrial y de cadena de suministro.'
    },
    thesis: 'Duopolio con una cartera de pedidos que da visibilidad de una década y crecientes ingresos de servicios. El reto es industrial: entregar a tiempo y recuperar márgenes.',
    risks: ['Problemas de cadena de suministro', 'Retrasos en entregas', 'Ciclo de la aviación y precio del combustible'],
    catalysts: ['Normalización de entregas', 'Recuperación del margen en aviones comerciales', 'Crecimiento de defensa y espacio'],
    notes: [
      'Duopolio con Boeing: barreras de entrada enormes.',
      'Gestión centrada en ejecución industrial.',
      'Crecimiento ligado al tráfico aéreo.',
      'Margen operativo del 11%, con recorrido.',
      'Caja neta positiva tras años de recuperación.',
      'Valoración razonable frente a su cartera de pedidos.',
      'Riesgo de ejecución y de proveedores.',
      'Catalizador: entregas y margen comercial.'
    ]
  },
  {
    t: 'IBE.MC', name: 'Iberdrola', exchange: 'BME', country: 'España', region: 'EU',
    sector: 'Utilities', currency: 'EUR', price: 16.4, cap: 105,
    moat: 'Activos regulados + red', moatRating: 'Narrow',
    metrics: { revCagr: 6.0, grossMargin: 34.0, opMargin: 20.0, roic: 7.5, roe: 12.0, netDebtEbitda: 3.6, intCover: 5.5, per: 16.0, evebitda: 9.5, fcfYield: 5.0, divYield: 4.0 },
    scores: [7.8, 8.4, 6.4, 7.8, 7.4, 6.0, 7.2, 7.4],
    f1: {
      negocio: 'Utility integrada: redes de distribución, generación renovable y comercialización de electricidad.',
      dinero: 'Ingresos regulados por redes y venta de electricidad con contratos a largo plazo.',
      sustitucion: 'La red eléctrica es un monopolio natural regulado; no hay alternativa para el cliente final.',
      dominio: 'Primer grupo eléctrico europeo por capitalización, con presencia en España, Reino Unido, EE. UU. y Brasil.',
      durabilidad: 'Alta por activos regulados y renovables, con riesgo regulatorio y de tipos de interés.'
    },
    thesis: 'Utility con crecimiento por inversión en redes y renovables, dividendo atractivo y flujos muy predecibles. Sensible a los tipos de interés, que es a la vez su riesgo y su oportunidad.',
    risks: ['Cambios regulatorios en España y Reino Unido', 'Sensibilidad a los tipos de interés', 'Apalancamiento elevado'],
    catalysts: ['Plan de inversión en redes', 'Bajada de tipos de interés', 'Crecimiento de capacidad renovable'],
    notes: [
      'Redes reguladas: monopolio natural con retorno asegurado.',
      'Gestión con historial de inversión disciplinada.',
      'Crecimiento moderado y muy predecible.',
      'ROIC bajo por intensidad de capital, típico del sector.',
      'Deuda alta, pero con vencimientos largos y tipos fijos.',
      'Valoración atractiva y dividendo del 4%.',
      'Riesgo regulatorio y de tipos.',
      'Catalizador: recorte de tipos e inversión en red.'
    ]
  },
  {
    t: 'SAN.MC', name: 'Banco Santander', exchange: 'BME', country: 'España', region: 'EU',
    sector: 'Financiero', currency: 'EUR', price: 7.2, cap: 110,
    moat: 'Escala + red minorista', moatRating: 'Narrow',
    metrics: { revCagr: 8.0, grossMargin: 0, opMargin: 42.0, roic: 0, roe: 14.5, netDebtEbitda: 0, intCover: 0, per: 8.0, evebitda: 0, fcfYield: 0, divYield: 4.6 },
    scores: [6.8, 7.4, 4.8, 7.0, 7.6, 7.6, 7.0, 6.2],
    f1: {
      negocio: 'Banco minorista y comercial con presencia en Europa, Norteamérica y Sudamérica.',
      dinero: 'Margen de intereses (diferencia entre lo que paga por depósitos y cobra por créditos) y comisiones.',
      sustitucion: 'La cuenta nómina y la relación bancaria tienen inercia, pero la banca digital reduce el coste de cambio.',
      dominio: 'Primer banco español por activos y uno de los mayores de la eurozona, aunque en mercados fragmentados.',
      durabilidad: 'Media: escala y diversificación geográfica, pero es un negocio cíclico y muy regulado.'
    },
    thesis: 'Banco con diversificación geográfica, rentabilidad sobre recursos propios del 14% y dividendo alto. Cotiza por debajo de su valor contable, lo que refleja el riesgo de tipos y de ciclo crediticio.',
    risks: ['Ciclo de tipos de interés a la baja', 'Mora en Brasil y México', 'Regulación bancaria y nuevos impuestos'],
    catalysts: ['Recompras con el exceso de capital', 'Mejora de la eficiencia', 'Normalización de la mora'],
    notes: [
      'Escala y diversificación, sin ventaja competitiva excepcional.',
      'Gestión enfocada en rentabilidad por acción.',
      'Crecimiento ligado al crédito y a los tipos.',
      'ROE del 14,5%, por encima de su coste de capital.',
      'Balance típico de banco, con solvencia adecuada.',
      'Cotiza a 8 veces beneficios y 0,9 veces libros.',
      'Riesgo de ciclo y de regulación.',
      'Catalizador: recompras y tipos.'
    ]
  }
];

export const NEWS = [
  {
    id: 'n1', date: '2026-11-25', t: 'NVDA', category: 'Resultados', sentiment: 'positiva', impact: 'Alto',
    headline: 'NVIDIA publica resultados: el mercado mira el margen bruto y la guía de centros de datos',
    summary: 'Los inversores se centran en si el margen bruto del 74% se mantiene y en la visibilidad de pedidos para los próximos trimestres. Cualquier señal de desaceleración del gasto en IA tendría impacto en toda la cadena de semiconductores.'
  },
  {
    id: 'n2', date: '2026-11-24', t: 'ASML', category: 'Guidance', sentiment: 'neutral', impact: 'Alto',
    headline: 'ASML actualiza su previsión anual: el ciclo de memoria marca el ritmo de los pedidos',
    summary: 'La compañía mantiene su plan de capacidad para High-NA EUV, pero el ritmo de pedidos depende de los fabricantes de memoria. Es el indicador más seguido para calibrar el ciclo de capex de semiconductores en Europa.'
  },
  {
    id: 'n3', date: '2026-11-24', t: 'LLY', category: 'Regulación', sentiment: 'negativa', impact: 'Medio',
    headline: 'Eli Lilly: la presión sobre el precio de los GLP-1 vuelve al centro del debate político',
    summary: 'Las aseguradoras y los programas públicos discuten nuevas condiciones de reembolso para los tratamientos de obesidad. El volumen sigue creciendo, pero el precio neto por receta es la variable a vigilar en los próximos trimestres.'
  },
  {
    id: 'n4', date: '2026-11-23', t: 'SAP', category: 'Producto', sentiment: 'positiva', impact: 'Medio',
    headline: 'SAP amplía su capa de agentes de IA en sus módulos de ERP y finanzas',
    summary: 'La compañía integra automatización de procesos dentro de su nube empresarial. El punto clave para la tesis es si logra monetizarlo con subidas de precio o con módulos adicionales, sin frenar la migración a la nube.'
  },
  {
    id: 'n5', date: '2026-11-23', t: 'MC.PA', category: 'Macro', sentiment: 'neutral', impact: 'Medio',
    headline: 'LVMH: el consumo de lujo en China sigue siendo la variable que mueve la cotización',
    summary: 'Los datos de gasto de los consumidores asiáticos y el tráfico turístico marcan la evolución del sector. La calidad de las marcas no está en duda; la recuperación del volumen sí.'
  },
  {
    id: 'n6', date: '2026-11-22', t: 'AAPL', category: 'Regulación', sentiment: 'negativa', impact: 'Medio',
    headline: 'Apple: nuevas reglas europeas sobre tiendas de aplicaciones y pagos alternativos',
    summary: 'La regulación europea avanza en obligar a permitir pagos fuera de la App Store. El impacto directo es limitado en ingresos, pero sienta precedente para otras jurisdicciones y para el margen de servicios.'
  },
  {
    id: 'n7', date: '2026-11-22', t: 'MSFT', category: 'Analistas', sentiment: 'positiva', impact: 'Medio',
    headline: 'Microsoft: los analistas revisan al alza el crecimiento de Azure por demanda de IA',
    summary: 'Varias casas de análisis elevan sus estimaciones de crecimiento cloud tras las últimas encuestas de gasto empresarial. El riesgo es que el capex siga creciendo más rápido que los ingresos.'
  },
  {
    id: 'n8', date: '2026-11-21', t: 'NOVO-B.CO', category: 'Producto', sentiment: 'positiva', impact: 'Alto',
    headline: 'Novo Nordisk presenta nuevos datos de su GLP-1 oral en fase avanzada',
    summary: 'La eficacia y la tolerabilidad de la versión oral son claves para defender la cuota frente a la competencia. Si los datos se confirman, el mercado de obesidad amplía su base de pacientes.'
  },
  {
    id: 'n9', date: '2026-11-21', t: 'V', category: 'Resultados', sentiment: 'positiva', impact: 'Medio',
    headline: 'Visa: el gasto nominal crece y los servicios de valor añadido ganan peso en los ingresos',
    summary: 'El volumen procesado se mantiene sólido y la partida de servicios crece por encima de la media. La cotización sigue muy sensible a cualquier indicio de debilidad del consumidor estadounidense.'
  },
  {
    id: 'n10', date: '2026-11-20', t: 'SIE.DE', category: 'M&A', sentiment: 'neutral', impact: 'Medio',
    headline: 'Siemens estudia simplificar su estructura con la venta de negocios no estratégicos',
    summary: 'Una cartera más enfocada en automatización y software industrial sería mejor valorada por el mercado. La operación, si se concreta, podría reducir el descuento de conglomerado.'
  },
  {
    id: 'n11', date: '2026-11-20', t: 'AMZN', category: 'Guidance', sentiment: 'neutral', impact: 'Alto',
    headline: 'Amazon: el capex de IA y logística vuelve a marcar la guía de flujo de caja libre',
    summary: 'El mercado tolera el aumento de inversión mientras AWS y publicidad crezcan por encima del retail. La normalización del capex es el principal catalizador para el flujo de caja libre.'
  },
  {
    id: 'n12', date: '2026-11-19', t: 'SAN.MC', category: 'Recompras', sentiment: 'positiva', impact: 'Medio',
    headline: 'Santander anuncia una nueva recompra de acciones con el exceso de capital',
    summary: 'La entidad mantiene su política de retribución al accionista y reduce el número de acciones en circulación. El atractivo depende de que el coste del riesgo se mantenga controlado en Brasil y México.'
  },
  {
    id: 'n13', date: '2026-11-19', t: 'GOOGL', category: 'Regulación', sentiment: 'negativa', impact: 'Alto',
    headline: 'Alphabet: el expediente antimonopolio sobre publicidad digital entra en fase decisiva',
    summary: 'Un remedio estructural podría afectar a la integración de su stack publicitario. La valoración actual ya recoge parte del riesgo, pero el resultado es binario para la división de anuncios.'
  },
  {
    id: 'n14', date: '2026-11-18', t: 'ADYEN.AS', category: 'Resultados', sentiment: 'positiva', impact: 'Medio',
    headline: 'Adyen mantiene el crecimiento del volumen y mejora el margen operativo',
    summary: 'La compañía avanza en apalancamiento operativo con expansión de márgenes. La acción sigue siendo muy volátil: pequeñas variaciones en el crecimiento cambian mucho la valoración.'
  },
  {
    id: 'n15', date: '2026-11-18', t: 'COST', category: 'Analistas', sentiment: 'neutral', impact: 'Bajo',
    headline: 'Costco: la renovación de socios y la subida de cuota, bajo la lupa de los analistas',
    summary: 'El modelo depende de la cuota de membresía, no del margen comercial. La pregunta es cuánto puede subir el precio de la cuota sin afectar a la renovación.'
  },
  {
    id: 'n16', date: '2026-11-17', t: 'AIR.PA', category: 'Guidance', sentiment: 'negativa', impact: 'Medio',
    headline: 'Airbus: la cadena de suministro sigue condicionando el ritmo de entregas',
    summary: 'Los retrasos de proveedores estructurales presionan el calendario y el capital circulante. El mercado vigila la capacidad de cumplir el objetivo anual sin sacrificar margen.'
  },
  {
    id: 'n17', date: '2026-11-17', t: 'JNJ', category: 'Regulación', sentiment: 'neutral', impact: 'Bajo',
    headline: 'Johnson & Johnson: avances en la resolución de litigios pendientes',
    summary: 'Una resolución ordenada reduciría la incertidumbre que pesa sobre la valoración. La caja del grupo permite absorber el impacto, pero el calendario judicial sigue siendo impredecible.'
  },
  {
    id: 'n18', date: '2026-11-16', t: 'RMS.PA', category: 'Macro', sentiment: 'positiva', impact: 'Bajo',
    headline: 'Hermès: la demanda de marroquinería sigue por encima de la capacidad productiva',
    summary: 'La lista de espera y la ausencia de descuentos sostienen los márgenes del 41%. El límite para el inversor no es el negocio, sino el múltiplo que paga por él.'
  }
];
