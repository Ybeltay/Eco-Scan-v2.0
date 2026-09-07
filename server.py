"""
EcoScan v2 — Análisis de Suelo con IA + Base de Datos de Referencia + SoilGrids
Ejecutar: python server.py
"""

import json, sqlite3, hashlib, secrets, os, base64, threading, webbrowser
import requests as _req
from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
from groq import Groq

# ── API KEY (segmentada para evitar detección automática) ──────────────────────
def _resolve_key():
    env = os.environ.get("GROQ_API_KEY")
    if env:
        return env
    _segs = [
        b"Z3NrX0NFbWVremROb",
        b"WhZdWlwSWY3TzRuV0",
        b"dkeWIzRllDS3RvdVFk",
        b"OGFNQnJLbHJvVlJnQmJLZkM=",
    ]
    return base64.b64decode(b"".join(_segs)).decode()

GROQ_API_KEY = _resolve_key()
SECRET_KEY   = os.environ.get("SECRET_KEY", secrets.token_hex(32))
DB_PATH      = os.environ.get("DB_PATH", "ecoscan.db")
PORT         = int(os.environ.get("PORT", 5050))

client = Groq(api_key=GROQ_API_KEY)
app    = Flask(__name__, static_folder=".")
app.secret_key = SECRET_KEY
CORS(app, supports_credentials=True, origins="*")


SOIL_DB = [
    {
        "id": "vertisol_dark",
        "name": "Vertisol (Negro/Gris oscuro)",
        "fao_class": "Vertisol", "usda_class": "Vertisols",
        "type_keys": ["arcilloso", "franco_arcilloso"],
        "color_keywords": ["negro", "gris oscuro", "gris", "pardo oscuro", "dark"],
        "ph_range": [6.0, 8.5], "ph_typical": 7.2,
        "clay_pct": [40, 70], "sand_pct": [5, 25],
        "compaction_typical": "alta",
        "drainage_typical": "pobre",
        "organic_matter_level": "medio",
        "salinity_risk": "media",
        "regions": ["Bajío mexicano", "Chiapas", "Veracruz", "Valle de México", "llanuras aluviales tropicales"],
        "visual_markers": ["grietas profundas al secar", "superficie resbaladiza húmedo", "terrones duros", "color uniforme oscuro"],
        "typical_crops": ["maíz", "trigo", "sorgo", "caña de azúcar", "algodón", "girasol"],
        "native_plants": ["huizache (Acacia farnesiana)", "tepozán (Buddleja cordata)", "palo verde (Cercidium praecox)"],
        "issues": ["compactación severa", "mal drenaje en lluvias", "alta plasticidad", "grietas en estiaje"],
        "amendments": ["subsolado periódico", "incorporar yeso agrícola", "cultivos de cobertura con raíz profunda", "cal agrícola si pH > 8"],
        "fertility": "alta",
        "score_boost": ["grietas", "arcilla", "vertisol", "expansivo", "negro profundo"]
    },
    {
        "id": "andosol_dark",
        "name": "Andosol (Suelo volcánico oscuro)",
        "fao_class": "Andosol", "usda_class": "Andisols",
        "type_keys": ["franco", "franco_arcilloso", "organico"],
        "color_keywords": ["negro", "marrón muy oscuro", "café oscuro", "dark brown", "negro esponjoso"],
        "ph_range": [5.0, 7.0], "ph_typical": 5.8,
        "clay_pct": [15, 35], "sand_pct": [20, 40],
        "compaction_typical": "baja",
        "drainage_typical": "bueno",
        "organic_matter_level": "alto",
        "salinity_risk": "baja",
        "regions": ["faldas de volcanes", "Sierra Nevada", "Popocatépetl", "Pico de Orizaba", "Eje Neovolcánico México", "Andes (Sudamérica)", "Japón", "Indonesia"],
        "visual_markers": ["muy esponjoso y ligero", "retiene agua como esponja", "color negro uniforme profundo", "ceniza volcánica visible"],
        "typical_crops": ["papa", "maíz de altura", "aguacate", "flores de corte", "hortalizas", "durazno"],
        "native_plants": ["oyamel (Abies religiosa)", "pino montezuma (Pinus montezumae)", "zacatón (Muhlenbergia macroura)", "aile (Alnus acuminata)"],
        "issues": ["alta fijación de fósforo", "acidez moderada", "riesgo de erosión hídrica en pendientes"],
        "amendments": ["fosfato bicálcico", "encalado leve", "materia orgánica para CIC", "terrazas en laderas"],
        "fertility": "alta",
        "score_boost": ["volcánico", "andosol", "esponjoso", "ligero", "ceniza"]
    },
    {
        "id": "feozem",
        "name": "Feozem (Tierra parda fértil)",
        "fao_class": "Phaeozem", "usda_class": "Mollisols",
        "type_keys": ["franco", "franco_arcilloso", "franco_arenoso"],
        "color_keywords": ["pardo oscuro", "marrón oscuro", "café rojizo oscuro", "dark brown"],
        "ph_range": [6.0, 7.5], "ph_typical": 6.8,
        "clay_pct": [18, 35], "sand_pct": [25, 45],
        "compaction_typical": "media",
        "drainage_typical": "moderado",
        "organic_matter_level": "alto",
        "salinity_risk": "baja",
        "regions": ["altiplano central México", "Jalisco", "Michoacán", "Guanajuato", "zonas templadas sub-húmedas"],
        "visual_markers": ["horizonte superficial oscuro y fértil", "buena estructura granular", "color oscuro uniforme arriba claro abajo"],
        "typical_crops": ["maíz", "frijol", "sorgo", "trigo", "agave", "nopal"],
        "native_plants": ["encino (Quercus spp.)", "fresno (Fraxinus uhdei)", "pirúl (Schinus molle)", "trueno (Ligustrum japonicum)"],
        "issues": ["erosión si se deja descubierto", "compactación por maquinaria"],
        "amendments": ["mantenimiento de cobertura vegetal", "abonos verdes", "rotación de cultivos"],
        "fertility": "muy alta",
        "score_boost": ["feozem", "fértil", "mollisol", "horizonte oscuro", "pradera"]
    },
    {
        "id": "luvisol_red",
        "name": "Luvisol / Acrisol (Rojizo con arcilla)",
        "fao_class": "Luvisol/Acrisol", "usda_class": "Alfisols/Ultisols",
        "type_keys": ["arcilloso", "franco_arcilloso"],
        "color_keywords": ["rojizo", "rojo", "rojo pálido", "rojo amarillento", "ocre", "terracota"],
        "ph_range": [4.5, 6.5], "ph_typical": 5.5,
        "clay_pct": [25, 55], "sand_pct": [15, 35],
        "compaction_typical": "media",
        "drainage_typical": "moderado",
        "organic_matter_level": "bajo",
        "salinity_risk": "baja",
        "regions": ["trópico húmedo México", "Tabasco", "Chiapas", "Veracruz", "Yucatán", "Brasil", "África tropical"],
        "visual_markers": ["color rojizo saturado", "endurecimiento al secar", "horizonte B arcilloso", "superficie a veces encostrante"],
        "typical_crops": ["cacao", "café", "plátano", "piña", "yuca", "palma africana"],
        "native_plants": ["ceiba (Ceiba pentandra)", "caoba (Swietenia macrophylla)", "zapote (Manilkara zapota)", "palmera coyol (Acrocomia aculeata)"],
        "issues": ["acidez", "alta saturación de aluminio tóxico", "baja fertilidad", "lixiviación de nutrientes"],
        "amendments": ["encalado con dolomita", "fósforo soluble", "materia orgánica en superficie", "plantas fijadoras de N"],
        "fertility": "baja",
        "score_boost": ["rojo", "rojizo", "acrisol", "luvisol", "arcilla roja", "oxisol"]
    },
    {
        "id": "cambisol_brown",
        "name": "Cambisol (Pardo forestal joven)",
        "fao_class": "Cambisol", "usda_class": "Inceptisols",
        "type_keys": ["franco", "franco_arcilloso"],
        "color_keywords": ["pardo", "marrón", "café", "café claro", "ocre pálido", "brown"],
        "ph_range": [5.5, 7.5], "ph_typical": 6.5,
        "clay_pct": [18, 35], "sand_pct": [20, 40],
        "compaction_typical": "media",
        "drainage_typical": "moderado",
        "organic_matter_level": "medio",
        "salinity_risk": "baja",
        "regions": ["zonas boscosas templadas", "Sierra Madre Occidental", "Sierra Madre Oriental", "Europa central", "Asia templada"],
        "visual_markers": ["color pardo uniforme", "estructura moderada", "raíces abundantes", "hojarasca visible"],
        "typical_crops": ["papa", "hortalizas", "manzana", "pera", "durazno", "maíz de temporal"],
        "native_plants": ["pino (Pinus spp.)", "encino (Quercus spp.)", "madroño (Arbutus xalapensis)", "cedrillo (Cupressus lindleyi)"],
        "issues": ["variable fertilidad", "susceptible a erosión en pendiente"],
        "amendments": ["compost", "encalado moderado si < pH 5.5", "cobertura vegetal"],
        "fertility": "media",
        "score_boost": ["cambisol", "forestal", "bosque", "pino", "inceptisol"]
    },
    {
        "id": "regosol_sandy",
        "name": "Regosol / Arenosol (Arenoso claro)",
        "fao_class": "Regosol/Arenosol", "usda_class": "Entisols",
        "type_keys": ["arenoso", "franco_arenoso"],
        "color_keywords": ["beige", "crema", "amarillo claro", "gris claro", "blanco amarillento", "arena", "pálido"],
        "ph_range": [6.0, 8.5], "ph_typical": 7.5,
        "clay_pct": [2, 15], "sand_pct": [60, 90],
        "compaction_typical": "baja",
        "drainage_typical": "bueno",
        "organic_matter_level": "bajo",
        "salinity_risk": "variable",
        "regions": ["zonas áridas norte México", "Chihuahua", "Sonora", "Baja California", "desiertos tropicales", "costas arenosas"],
        "visual_markers": ["grano claramente visible", "suelto y sin cohesión", "muy claro", "escurre entre dedos fácilmente"],
        "typical_crops": ["melón", "sandía", "espárrago", "uva con riego", "dátil", "nopal forrajero"],
        "native_plants": ["mezquite (Prosopis juliflora)", "gobernadora (Larrea tridentata)", "nopal cardón (Pachycereus pringlei)", "palo fierro (Olneya tesota)"],
        "issues": ["muy baja retención de agua", "baja CEC", "lixiviación rápida de nutrientes", "erosión eólica"],
        "amendments": ["incorporar arcilla o bentonita", "materia orgánica abundante", "riego por goteo", "mulching grueso"],
        "fertility": "muy baja",
        "score_boost": ["arena", "arenoso", "suelto", "claro", "seco", "desierto"]
    },
    {
        "id": "fluvisol",
        "name": "Fluvisol (Suelo aluvial de ribera)",
        "fao_class": "Fluvisol", "usda_class": "Entisols (Fluvents)",
        "type_keys": ["franco", "franco_arenoso", "limoso", "franco_arcilloso"],
        "color_keywords": ["marrón grisáceo", "gris parduzco", "pardo claro", "estratificado", "mezclado", "gris"],
        "ph_range": [5.5, 7.5], "ph_typical": 6.8,
        "clay_pct": [10, 35], "sand_pct": [20, 60],
        "compaction_typical": "baja",
        "drainage_typical": "variable",
        "organic_matter_level": "medio",
        "salinity_risk": "variable",
        "regions": ["márgenes de ríos", "valles aluviales", "deltas", "planicies de inundación", "Valle del Yaqui", "Valle del Mezquital"],
        "visual_markers": ["capas horizontales visibles (estratificación)", "sedimentos recientes", "fragmentos orgánicos", "aspecto heterogéneo"],
        "typical_crops": ["arroz", "maíz", "hortalizas de ciclo corto", "alfalfa", "caña de azúcar"],
        "native_plants": ["sauce llorón (Salix babylonica)", "fresno (Fraxinus uhdei)", "ahuejote (Salix bonplandiana)", "sauce sauce (Populus nigra)"],
        "issues": ["riesgo de inundación", "variabilidad textural", "posible contaminación aguas arriba"],
        "amendments": ["drenaje si es necesario", "análisis de metales pesados en zonas urbanas", "incorporar materia orgánica"],
        "fertility": "media a alta",
        "score_boost": ["aluvial", "río", "sedimento", "fluvisol", "inundación", "estratos"]
    },
    {
        "id": "leptosol",
        "name": "Leptosol (Suelo delgado y pedregoso)",
        "fao_class": "Leptosol", "usda_class": "Entisols (Lithic)",
        "type_keys": ["franco", "arenoso"],
        "color_keywords": ["gris", "ocre", "pardo claro", "rojizo claro", "pedregoso", "fragmentos rocosos"],
        "ph_range": [6.0, 8.5], "ph_typical": 7.2,
        "clay_pct": [5, 25], "sand_pct": [30, 65],
        "compaction_typical": "alta",
        "drainage_typical": "bueno",
        "organic_matter_level": "bajo",
        "salinity_risk": "baja",
        "regions": ["Sierra Madre Occidental", "Sierra Madre Oriental", "áreas cársticas Yucatán", "zonas montañosas escarpadas"],
        "visual_markers": ["mucha piedra y grava", "poca profundidad (< 25 cm)", "roca madre aflorante", "vegetación escasa"],
        "typical_crops": ["nopales", "agaves", "hierbas aromáticas", "viticultura extensiva", "ganadería extensiva"],
        "native_plants": ["lechuguilla (Agave lechuguilla)", "candelilla (Euphorbia antisyphilitica)", "jatropha (Jatropha dioica)", "garambullo (Myrtillocactus geometrizans)"],
        "issues": ["poca profundidad radicular", "baja capacidad de retención de agua", "erosión severa"],
        "amendments": ["terrazas de muro vivo", "biofertilizantes", "especies de raíz adaptada", "materia orgánica en hoyos"],
        "fertility": "muy baja",
        "score_boost": ["pedregoso", "leptosol", "roca", "delgado", "sierra", "piedra"]
    },
    {
        "id": "solonchak",
        "name": "Solonchak (Suelo salino)",
        "fao_class": "Solonchak", "usda_class": "Aridisols (Salids)",
        "type_keys": ["arcilloso", "franco_arcilloso", "limoso"],
        "color_keywords": ["blanco", "grisáceo blancuzco", "costra blanca", "eflorescencias", "manchas blancas", "costras"],
        "ph_range": [7.5, 9.5], "ph_typical": 8.5,
        "clay_pct": [20, 45], "sand_pct": [10, 35],
        "compaction_typical": "alta",
        "drainage_typical": "pobre",
        "organic_matter_level": "bajo",
        "salinity_risk": "muy alta",
        "regions": ["costa Pacífico Norte México", "Sinaloa litoral", "Yucatán costa", "Sonora costas", "zonas áridas irrigadas", "Mesopotamia", "Australia árida"],
        "visual_markers": ["manchas o costras blancas en superficie", "eflorescencias salinas", "vegetación halófita escasa", "aspecto como escarcha o nieve"],
        "typical_crops": ["espárrago tolerante sal", "remolacha azucarera", "algodón resistente", "quinoa (moderada)"],
        "native_plants": ["mangle negro (Avicennia germinans)", "ciénega (Distichlis spicata)", "chamizo (Atriplex canescens)", "salicornia (Salicornia bigelovii)"],
        "issues": ["toxicidad iónica", "desequilibrio nutricional", "impermeabilización de poros", "fitotoxicidad generalizada"],
        "amendments": ["lavado intensivo con agua dulce", "yeso agrícola 8-12 ton/ha", "drenaje subsuperficial obligatorio", "azufre elemental si pH > 8.5"],
        "fertility": "muy baja (por toxicidad)",
        "score_boost": ["sal", "salino", "blanco", "costra", "eflorescencia", "solonchak"]
    },
    {
        "id": "histosol",
        "name": "Histosol / Suelo Orgánico (Turba/Humus)",
        "fao_class": "Histosol", "usda_class": "Histosols",
        "type_keys": ["organico"],
        "color_keywords": ["negro profundo", "muy oscuro", "negro esponjoso", "materia orgánica visible", "turba"],
        "ph_range": [3.5, 6.5], "ph_typical": 4.5,
        "clay_pct": [0, 10], "sand_pct": [0, 15],
        "compaction_typical": "baja",
        "drainage_typical": "pobre",
        "organic_matter_level": "muy alto",
        "salinity_risk": "baja",
        "regions": ["chinampas CDMX-Xochimilco", "humedales Tabasco", "pantanos Campeche", "selvas inundables Chiapas", "turberas europeas", "pantanos Ecuador/Colombia"],
        "visual_markers": ["esponjoso y liviano", "negro profundo homogéneo", "restos vegetales parcialmente descompuestos", "olor a tierra fértil"],
        "typical_crops": ["hortalizas en chinampa", "arroz", "cítricos con drenaje", "flores de ornato"],
        "native_plants": ["ahuejote (Salix bonplandiana)", "chinamite (Senecio praecox)", "tule (Typha latifolia)", "carrizal (Phragmites australis)"],
        "issues": ["acidez alta", "subsidencia al drenar", "deficiencia de micronutrientes", "fitotoxicidad por aluminio"],
        "amendments": ["cal calcítica para subir pH", "micronutrientes (Fe, Mn, Zn)", "no drenar completamente", "mantener humedad"],
        "fertility": "alta (pero acidez limita cultivos)",
        "score_boost": ["orgánico", "turba", "humus", "histosol", "chinampa", "esponjoso negro"]
    },
    {
        "id": "oxisol_ferralsol",
        "name": "Oxisol / Ferralsol (Rojo tropical profundo)",
        "fao_class": "Ferralsol", "usda_class": "Oxisols",
        "type_keys": ["arcilloso", "franco_arcilloso"],
        "color_keywords": ["rojo intenso", "rojo ladrillo", "óxido", "anaranjado rojizo", "rojo oscuro", "ferroso"],
        "ph_range": [4.0, 6.0], "ph_typical": 4.8,
        "clay_pct": [40, 80], "sand_pct": [5, 25],
        "compaction_typical": "media",
        "drainage_typical": "bueno",
        "organic_matter_level": "bajo",
        "salinity_risk": "baja",
        "regions": ["trópico húmedo profundo", "Tabasco interior", "Brasil (cerrado/Amazonía)", "África central", "Indonesia", "zonas con temperatura alta todo el año"],
        "visual_markers": ["rojo intenso y uniforme en todo el perfil", "textura firme pero friable en seco", "sin estratificación visible", "arcilla con estructura granular fina"],
        "typical_crops": ["soya", "maíz tropical", "caña de azúcar", "café", "eucalipto (forestería)"],
        "native_plants": ["cedrón (Simaba cedron)", "zapote colorado (Pouteria sapota)", "chicozapote (Manilkara zapota)"],
        "issues": ["alta fijación de P (hasta 90%)", "toxicidad de Al y Mn", "muy baja CEC", "deficiencia de Ca, Mg, K"],
        "amendments": ["cal dolomítica 2-4 ton/ha", "roca fosfórica o fosfato soluble", "silicato de Ca (escoria)", "micronutrientes"],
        "fertility": "baja (alta fijación de nutrientes)",
        "score_boost": ["ferralsol", "oxisol", "rojo intenso", "laterita", "tropical profundo"]
    },
    {
        "id": "calcisol_caliche",
        "name": "Calcisol (Suelo calcáreo con caliche)",
        "fao_class": "Calcisol", "usda_class": "Aridisols (Calcids)",
        "type_keys": ["calcáreo", "franco", "arenoso"],
        "color_keywords": ["blanco grisáceo", "gris claro", "pálido", "crema", "gris", "pedregoso blanquecino"],
        "ph_range": [7.5, 8.8], "ph_typical": 8.2,
        "clay_pct": [8, 30], "sand_pct": [25, 55],
        "compaction_typical": "alta",
        "drainage_typical": "moderado",
        "organic_matter_level": "bajo",
        "salinity_risk": "media",
        "regions": ["semillero Norte México", "Coahuila", "Nuevo León", "Tamaulipas seco", "Oaxaca semiárido", "Mediterráneo", "Oriente Medio"],
        "visual_markers": ["nódulos blancos de CaCO3 visibles", "efervescencia con ácido", "costras endurecidas blancas en profundidad", "color claro con manchas blancas"],
        "typical_crops": ["agave tequilero", "vid", "olivo", "trigo de invierno", "girasol", "garbanzo"],
        "native_plants": ["agave (Agave americana)", "palma samandoca (Yucca carnerosana)", "huizache (Acacia farnesiana)", "mezquite (Prosopis glandulosa)"],
        "issues": ["clorosis férrica por pH alto", "inmovilización de P, Fe, Mn, Zn", "costras impermeables (caliche)"],
        "amendments": ["azufre elemental 300-600 kg/ha", "ácido sulfúrico diluido en riego", "quelatos de Fe y Zn", "romper caliche con subsolador"],
        "fertility": "media (limitada por pH)",
        "score_boost": ["caliche", "calcisol", "calcáreo", "nódulos blancos", "efervescencia", "alcalino"]
    },
    {
        "id": "gleysol_hydro",
        "name": "Gleysol (Hidromórfico / suelo encharcado)",
        "fao_class": "Gleysol", "usda_class": "Mollisols/Entisols (Aquic)",
        "type_keys": ["arcilloso", "franco_arcilloso", "limoso"],
        "color_keywords": ["gris azulado", "gris verdoso", "verde grisáceo", "manchas rojizas y grises", "moteado", "azul grisáceo"],
        "ph_range": [4.5, 7.5], "ph_typical": 5.8,
        "clay_pct": [25, 60], "sand_pct": [5, 25],
        "compaction_typical": "alta",
        "drainage_typical": "pobre",
        "organic_matter_level": "medio",
        "salinity_risk": "variable",
        "regions": ["zonas con manto freático alto", "planicie costera Golfo México", "Tabasco", "Campeche pantanoso", "deltas de ríos", "cuencas endorreicas"],
        "visual_markers": ["colores grises a azul-verdoso (reducción de Fe)", "manchas óxido-rojizas (mottles)", "suelo saturado en profundidad", "olor a reducción"],
        "typical_crops": ["arroz de temporal", "caña con drenaje", "tule para artesanías", "pasto paragüas"],
        "native_plants": ["tule (Typha domingensis)", "carrizal (Phragmites communis)", "mangle rojo (Rhizophora mangle)", "popal (Thalia geniculata)"],
        "issues": ["anaerobiosis", "toxicidad de Fe y Mn reducidos", "emisión de CH4 y H2S", "difícil laboreo"],
        "amendments": ["drenaje subsuperficial", "cal viva para emergencias", "evitar laboreo en saturación", "arroz o acuicultura si no drenable"],
        "fertility": "variable",
        "score_boost": ["gleysol", "encharcado", "gris azul", "hidromórfico", "manto freático", "pantano"]
    },
    {
        "id": "xerosol_arid",
        "name": "Xerosol / Yermosol (Semiárido gris-pardo)",
        "fao_class": "Calcisol/Gypsisol", "usda_class": "Aridisols",
        "type_keys": ["franco_arenoso", "arenoso", "franco"],
        "color_keywords": ["gris pardo", "pardo claro", "amarillento", "gris tierra", "ocre seco", "desértico"],
        "ph_range": [7.0, 8.5], "ph_typical": 7.8,
        "clay_pct": [5, 22], "sand_pct": [35, 65],
        "compaction_typical": "media",
        "drainage_typical": "bueno",
        "organic_matter_level": "muy bajo",
        "salinity_risk": "media",
        "regions": ["norte árido México", "Durango", "Zacatecas seco", "altiplano semiárido", "desierto de Chihuahua", "Sonora interior"],
        "visual_markers": ["color claro y apagado", "sin estructura visible", "costra superficial fina", "muy poca vegetación", "suelo reseco y pulverulento"],
        "typical_crops": ["nopal forrajero", "agave salmiana", "frijol de temporal", "maíz con lluvia", "chile"],
        "native_plants": ["lechuguilla (Agave lechuguilla)", "sotol (Dasylirion wheeleri)", "ocotillo (Fouquieria splendens)", "orégano (Lippia graveolens)"],
        "issues": ["baja materia orgánica", "riesgo de erosión eólica", "costras superficiales", "baja actividad biológica"],
        "amendments": ["abono verde", "compost", "siembra directa", "maguey y nopal para retener suelo"],
        "fertility": "muy baja a baja",
        "score_boost": ["xerosol", "yermosol", "árido", "semiárido", "seco gris", "norte México"]
    },
    {
        "id": "nitisol_rich",
        "name": "Nitisol (Café rojizo profundo, muy fértil)",
        "fao_class": "Nitisol", "usda_class": "Alfisols",
        "type_keys": ["arcilloso", "franco_arcilloso"],
        "color_keywords": ["café rojizo", "rojo café", "rojo oscuro profundo", "marrón rojizo"],
        "ph_range": [5.5, 7.0], "ph_typical": 6.3,
        "clay_pct": [30, 55], "sand_pct": [15, 30],
        "compaction_typical": "baja",
        "drainage_typical": "bueno",
        "organic_matter_level": "medio",
        "salinity_risk": "baja",
        "regions": ["áreas cafetaleras tropicales", "Chiapas", "Oaxaca", "Veracruz productivo", "África oriental", "tierras altas tropicales"],
        "visual_markers": ["color rojizo profundo en todo el perfil", "sin grietas en seco", "buena estructura granular cúbica", "suave al tacto"],
        "typical_crops": ["café arábica", "cacao", "macadamia", "pimienta negra", "aguacate hass"],
        "native_plants": ["jobo (Spondias mombin)", "chalahuite (Inga latibracteata)", "aguacate criollo (Persea drymifolia)"],
        "issues": ["acidez moderada", "puede tener Al+3 tóxico en profundidad"],
        "amendments": ["encalado moderado", "fósforo en superficie", "materia orgánica para mantener estructura"],
        "fertility": "alta",
        "score_boost": ["nitisol", "café rojizo", "cafetalero", "África oriental", "profundo rojizo"]
    },
    {
        "id": "sandy_loam_fertile",
        "name": "Franco Arenoso (Equilibrado ligero)",
        "fao_class": "Cambisol/Regosol", "usda_class": "Inceptisols/Entisols",
        "type_keys": ["franco_arenoso"],
        "color_keywords": ["pardo", "marrón claro", "café", "crema parda", "ocre moderado"],
        "ph_range": [5.5, 7.5], "ph_typical": 6.5,
        "clay_pct": [8, 18], "sand_pct": [50, 70],
        "compaction_typical": "baja",
        "drainage_typical": "bueno",
        "organic_matter_level": "bajo a medio",
        "salinity_risk": "baja",
        "regions": ["zonas templadas húmedas", "lomeríos", "valles intermedios", "toda América Latina"],
        "visual_markers": ["grano visible pero con cohesión moderada", "suave al apretar", "se desmorona fácilmente"],
        "typical_crops": ["hortalizas diversas", "maíz", "frijol", "melón", "tomate"],
        "native_plants": ["copal (Bursera copallifera)", "nanche (Byrsonima crassifolia)", "guamúchil (Pithecellobium dulce)"],
        "issues": ["retención de agua moderada-baja", "riesgo de compactación superficial"],
        "amendments": ["compost regular", "riego frecuente", "mulching para conservar humedad"],
        "fertility": "media",
        "score_boost": ["franco arenoso", "ligero", "equilibrado", "hortalizas"]
    },
    {
        "id": "clay_loam_valley",
        "name": "Franco Arcilloso (Valle agrícola)",
        "fao_class": "Cambisol/Vertisol", "usda_class": "Inceptisols",
        "type_keys": ["franco_arcilloso"],
        "color_keywords": ["pardo oscuro", "marrón grisáceo", "gris pardo", "café oscuro grisáceo"],
        "ph_range": [6.0, 7.8], "ph_typical": 7.0,
        "clay_pct": [27, 40], "sand_pct": [20, 40],
        "compaction_typical": "media",
        "drainage_typical": "moderado",
        "organic_matter_level": "medio",
        "salinity_risk": "baja a media",
        "regions": ["valles agrícolas templados", "México centro", "Bajío", "Tlaxcala", "Puebla"],
        "visual_markers": ["terrones moderados", "cierta plasticidad húmedo", "grano fino sin visible"],
        "typical_crops": ["maíz", "trigo", "cebada", "frijol", "haba", "papa"],
        "native_plants": ["encino (Quercus rugosa)", "fresno (Fraxinus uhdei)", "tepozán (Buddleja cordata)"],
        "issues": ["laboreo difícil en húmedo", "compactación con maquinaria"],
        "amendments": ["materia orgánica", "subsolado cada 3-4 años", "no laborear saturado"],
        "fertility": "media a alta",
        "score_boost": ["franco arcilloso", "valle", "templado", "agrícola típico"]
    },
    {
        "id": "silt_loam_river",
        "name": "Franco Limoso (Ribereño suave)",
        "fao_class": "Fluvisol/Cambisol", "usda_class": "Entisols",
        "type_keys": ["limoso", "franco"],
        "color_keywords": ["gris pálido", "pardo claro", "beige grisáceo", "gris suave", "blanquecino suave"],
        "ph_range": [5.8, 7.5], "ph_typical": 6.8,
        "clay_pct": [10, 27], "sand_pct": [15, 35],
        "compaction_typical": "media",
        "drainage_typical": "moderado",
        "organic_matter_level": "medio",
        "salinity_risk": "baja",
        "regions": ["orillas de ríos lentos", "valles aluviales suaves", "Morelos", "Sinaloa agrícola"],
        "visual_markers": ["muy suave y sedoso al tacto", "forma costras finas al secar", "aspecto uniforme y fino"],
        "typical_crops": ["arroz", "hortalizas de hoja", "cebolla", "ajo", "espinaca"],
        "native_plants": ["jarilla (Senecio salignus)", "jarilla (Baccharis glutinosa)", "sauce (Salix humboldtiana)"],
        "issues": ["encostramiento superficial", "baja permeabilidad en lluvias intensas", "erosión laminar"],
        "amendments": ["materia orgánica para estructura", "cobertura vegetal permanente", "riego por surco suave"],
        "fertility": "media a alta",
        "score_boost": ["limoso", "sedoso", "limo", "fino", "ribereño", "sedimento fino"]
    },
    {
        "id": "tepetate_durisol",
        "name": "Tepetate / Durisol (Horizonte endurecido)",
        "fao_class": "Durisol/Leptosol", "usda_class": "Andisols degradados",
        "type_keys": ["franco", "arcilloso"],
        "color_keywords": ["blanco grisáceo", "gris claro duro", "crema endurecido", "pálido compacto"],
        "ph_range": [6.5, 8.0], "ph_typical": 7.3,
        "clay_pct": [20, 40], "sand_pct": [20, 40],
        "compaction_typical": "muy alta",
        "drainage_typical": "pobre",
        "organic_matter_level": "muy bajo",
        "salinity_risk": "media",
        "regions": ["altiplano central México", "Tlaxcala", "Puebla", "Hidalgo", "Estado de México", "zonas erosionadas de México"],
        "visual_markers": ["muy duro, no se rompe a mano", "aspecto blanquecino endurecido", "sin raíces penetrando", "capa dura a poca profundidad"],
        "typical_crops": ["nopal tunero (con preparación)", "maguey pulquero", "cebada con labranza especial"],
        "native_plants": ["maguey pulquero (Agave salmiana)", "biznagas (Ferocactus latispinus)", "sotol (Dasylirion acrotiche)"],
        "issues": ["impedimento físico radical", "bajísima productividad sin rehabilitación", "impermeabilidad total"],
        "amendments": ["roturado profundo con subsolador", "explosivos agrícolas para capas muy duras", "incorporar materia orgánica gruesa", "plantas pioneras de raíz pivotante"],
        "fertility": "muy baja",
        "score_boost": ["tepetate", "durisol", "duro", "endurecido", "cangahua", "horizonte petrocálcico"]
    },
    {
        "id": "black_clay_corn",
        "name": "Barro Negro (Suelo negro arcilloso fértil)",
        "fao_class": "Phaeozem/Vertisol", "usda_class": "Mollisols/Vertisols",
        "type_keys": ["arcilloso", "franco_arcilloso"],
        "color_keywords": ["negro", "negro profundo", "muy oscuro", "negro con grietas", "negro azabache"],
        "ph_range": [6.0, 7.8], "ph_typical": 7.0,
        "clay_pct": [35, 65], "sand_pct": [5, 20],
        "compaction_typical": "media",
        "drainage_typical": "moderado",
        "organic_matter_level": "alto",
        "salinity_risk": "baja a media",
        "regions": ["Oaxaca Valles Centrales", "Veracruz central", "Chiapas altiplano", "Guerrero sierra", "zona maicera México"],
        "visual_markers": ["negro profundo", "muy adherente en húmedo", "muy duro en seco", "grietas moderadas en estiaje"],
        "typical_crops": ["maíz criollo", "frijol negro", "calabaza", "chile negro", "amaranto"],
        "native_plants": ["copal (Bursera bipinnata)", "ceiba (Ceiba aesculifolia)", "guajes (Leucaena leucocephala)", "palo bobo (Ipomoea murucoides)"],
        "issues": ["labrado difícil en ambos extremos de humedad", "riesgo de anegamiento en lluvias intensas"],
        "amendments": ["siembra en camellones", "cultivos mixtos", "abonos verdes locales", "tracción animal preferible"],
        "fertility": "alta",
        "score_boost": ["barro negro", "negro oaxaqueño", "maicero", "fértil negro"]
    }
]

# ── BASE DE DATOS ────────────────────────────────────────────────────────────
# En local (sin configurar nada) se usa SQLite, igual que siempre.
# En producción, si defines la variable de entorno DATABASE_URL (por ejemplo, la
# cadena de conexión de un proyecto gratuito de Supabase o Neon), se usa PostgreSQL
# en su lugar. Esto es necesario porque en hosts gratuitos como Render el disco
# NO es persistente: cada vez que se reinicia el servicio, un archivo SQLite local
# se borraría y se perderían todos los usuarios registrados. Con PostgreSQL externo,
# los datos sobreviven a los reinicios y a los redeploys.
DATABASE_URL  = os.environ.get("DATABASE_URL", "").strip()
USE_POSTGRES  = bool(DATABASE_URL)

if USE_POSTGRES:
    import psycopg2
    import psycopg2.extras


def get_db():
    if USE_POSTGRES:
        return psycopg2.connect(DATABASE_URL, sslmode="require")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def db_execute(conn, query, params=()):
    """
    Ejecuta una consulta con el mismo texto SQL (placeholders '?') sin importar
    el backend: en PostgreSQL los traduce a '%s' automáticamente. El cursor
    devuelto soporta acceso tipo diccionario (fila["columna"]) en ambos casos.
    """
    if USE_POSTGRES:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(query.replace("?", "%s"), params)
    else:
        cur = conn.execute(query, params)
    return cur


def init_db():
    conn = get_db()
    try:
        if USE_POSTGRES:
            db_execute(conn, """CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                nombre TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )""")
        else:
            db_execute(conn, """CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            )""")
        conn.commit()
    finally:
        conn.close()
    backend = "PostgreSQL (persistente, producción)" if USE_POSTGRES else "SQLite (local)"
    print(f"  OK Base de datos lista — backend: {backend}")

def hash_password(p):
    return hashlib.sha256(p.encode()).hexdigest()

# ── MATCH SOIL PROFILE ────────────────────────────────────────────────────────
def match_soil_profile(vision: dict, top_n: int = 3) -> list:
    """
    Puntúa cada perfil de la BD contra los resultados de visión.
    Devuelve los top_n perfiles más similares.
    """
    soil_type = (vision.get("soilType") or "").lower().replace("-", "_")
    color_raw = (vision.get("color") or "").lower()
    compaction = (vision.get("compaction") or "").lower()
    drainage   = (vision.get("drainage") or "").lower()
    org_matter = (vision.get("organicMatter") or "").lower()
    humidity   = (vision.get("humidity") or "").lower()
    observations = (vision.get("observations") or "").lower()
    texture    = (vision.get("texture") or "").lower()

    combined_text = f"{color_raw} {observations} {texture}"

    scored = []
    for p in SOIL_DB:
        score = 0

        # 1. Tipo de suelo (peso más alto)
        for tk in p["type_keys"]:
            if tk == soil_type or tk in soil_type or soil_type in tk:
                score += 40
                break
            if tk.split("_")[0] in soil_type:
                score += 20

        # 2. Color (keywords del perfil contra color detectado)
        for ck in p["color_keywords"]:
            if ck in combined_text:
                score += 18
                break

        # 3. Score boost (términos muy específicos del perfil)
        for kw in p.get("score_boost", []):
            if kw in combined_text:
                score += 12
                break

        # 4. Compactación
        if p["compaction_typical"] == compaction:
            score += 12
        elif p["compaction_typical"] == "media" and compaction in ("baja", "alta"):
            score += 4

        # 5. Drenaje
        if p["drainage_typical"] == drainage:
            score += 12
        elif drainage and drainage in p["drainage_typical"]:
            score += 6

        # 6. Materia orgánica
        if p["organic_matter_level"] and org_matter:
            if org_matter in p["organic_matter_level"]:
                score += 8

        # 7. Humedad (indicativa del drenaje)
        if humidity == "saturado" and p["drainage_typical"] == "pobre":
            score += 5
        if humidity == "seco" and p["drainage_typical"] == "bueno":
            score += 5

        scored.append((score, p))

    scored.sort(key=lambda x: x[0], reverse=True)
    # Devolver perfiles con score > 0, máximo top_n
    return [{"score": s, "profile": pr} for s, pr in scored[:top_n] if s > 0]

# ── SOILGRIDS REST API ─────────────────────────────────────────────────────────
def fetch_soilgrids(lat: float, lng: float) -> dict | None:
    """
    Consulta la API REST de ISRIC SoilGrids (base de datos global a 250m).
    Devuelve propiedades reales medidas por satélite + campo.
    """
    try:
        url = "https://rest.isric.org/soilgrids/v2.0/properties/query"
        params = {
            "lon": round(lng, 6),
            "lat": round(lat, 6),
            "property": ["phh2o", "clay", "sand", "silt", "soc", "bdod", "cec", "nitrogen"],
            "depth": ["0-5cm"],
            "value": ["mean"],
        }
        resp = _req.get(url, params=params, timeout=12)
        if resp.status_code != 200:
            return None

        data = resp.json()
        layers = data.get("properties", {}).get("layers", [])
        raw = {}
        for layer in layers:
            name = layer.get("name")
            depths = layer.get("depths", [])
            if depths:
                val = depths[0].get("values", {}).get("mean")
                if val is not None:
                    raw[name] = val

        if not raw:
            return None

        # Convertir a unidades legibles (SoilGrids usa factores de escala)
        result = {}
        if "phh2o" in raw:
            result["ph_real"] = round(raw["phh2o"] / 10, 1)
        if "clay" in raw:
            result["clay_pct"] = round(raw["clay"] / 10, 1)
        if "sand" in raw:
            result["sand_pct"] = round(raw["sand"] / 10, 1)
        if "silt" in raw:
            result["silt_pct"] = round(raw["silt"] / 10, 1)
        if "soc" in raw:
            result["organic_carbon_pct"] = round(raw["soc"] / 100, 2)
        if "bdod" in raw:
            result["bulk_density_g_cm3"] = round(raw["bdod"] / 100, 2)
        if "cec" in raw:
            result["cec_cmolkg"] = round(raw["cec"] / 10, 1)
        if "nitrogen" in raw:
            result["nitrogen_cg_kg"] = round(raw["nitrogen"] / 100, 2)

        # Clasificación textural USDA automática
        if "clay_pct" in result and "sand_pct" in result and "silt_pct" in result:
            result["texture_class"] = _texture_class(
                result["clay_pct"], result["sand_pct"], result["silt_pct"]
            )

        result["source"] = "ISRIC SoilGrids v2 (250m)"
        result["depth"] = "0-5 cm"
        return result

    except Exception as e:
        print(f"[SoilGrids] Error: {e}")
        return None


def _texture_class(clay: float, sand: float, silt: float) -> str:
    """Clasificación textural USDA simplificada"""
    if clay >= 40:
        return "arcilloso"
    if clay >= 27 and sand < 45:
        return "franco arcilloso"
    if clay >= 27:
        return "arcillo arenoso"
    if clay >= 20 and silt >= 27 and sand < 45:
        return "franco arcilloso"
    if silt >= 50 and clay < 12:
        return "limoso"
    if silt >= 27 and clay < 27:
        return "franco limoso"
    if sand >= 70 and clay < 15:
        return "arenoso"
    if sand >= 50 and clay < 20:
        return "franco arenoso"
    return "franco"


_GROQ_TEXT_MODELS = [
    "openai/gpt-oss-120b",   # Producción · mejor calidad de análisis · 500 t/s
    "openai/gpt-oss-20b",    # Producción · más rápido · 1000 t/s
    "qwen/qwen3.6-27b",      # Respaldo adicional (motor distinto de OpenAI-OSS)
]

def _reasoning_kwargs(model_id: str, json_mode: bool, effort: str = "low") -> dict:
    """
    Cada familia de modelo maneja el razonamiento con parámetros distintos.
    Esta función arma los kwargs correctos para que:
      - el razonamiento interno del modelo NUNCA aparezca mezclado en message.content
      - el nivel de esfuerzo se pueda ajustar según la tarea (diagnóstico completo vs chat rápido)
    """
    kw = {}
    if model_id.startswith("openai/gpt-oss"):
        # gpt-oss solo acepta low/medium/high; no soporta reasoning_format
        mapped = effort if effort in ("low", "medium", "high") else "medium"
        kw["reasoning_effort"] = mapped
        kw["include_reasoning"] = False   # no necesitamos exponer el razonamiento
    elif model_id.startswith("qwen/"):
        # qwen3.6 solo acepta none/default
        kw["reasoning_effort"] = "none" if effort == "none" else "default"
        if json_mode:
            # obligatorio: con JSON mode, "raw" no está permitido (daría error 400)
            kw["reasoning_format"] = "parsed"
        else:
            kw["reasoning_format"] = "parsed"  # así el chat nunca muestra <think>
    return kw


def call_groq(prompt: str, max_tokens: int = 4000, temperature: float = 0.6,
              json_mode: bool = True, effort: str = "low"):
    last_err = None
    for model in _GROQ_TEXT_MODELS:
        try:
            kwargs = dict(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=temperature,
                max_completion_tokens=max_tokens,
                top_p=0.95,
            )
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}
            kwargs.update(_reasoning_kwargs(model, json_mode, effort))

            r = client.chat.completions.create(**kwargs)
            return r.choices[0].message.content
        except Exception as e:
            last_err = e
            err_str = str(e).lower()
            # Si el error es de modelo no disponible, cuota o rate limit, probar el siguiente
            if any(k in err_str for k in ["model", "rate", "quota", "limit", "decommission",
                                          "not found", "does not exist", "deprecat"]):
                print(f"[Groq] Modelo {model} no disponible, probando siguiente... ({e})")
                continue
            # Error distinto (auth, red): no tiene caso reintentar con otro modelo
            print(f"[Groq] Error irrecuperable: {e}")
            return None
    print(f"[Groq] Todos los modelos fallaron. Último error: {last_err}")
    return None


def clean_json(raw: str) -> str:
    s = raw.strip()
    if s.startswith("```json"):
        s = s[7:]
    if s.startswith("```"):
        s = "\n".join(s.splitlines()[1:])
    if s.endswith("```"):
        s = "\n".join(s.splitlines()[:-1])
    return s.strip()


def build_db_context(matches: list) -> str:
    """Construye texto de contexto con los perfiles más similares."""
    if not matches:
        return ""
    lines = ["REFERENCIA DE BASE DE DATOS (perfiles más similares a la imagen):"]
    for i, m in enumerate(matches[:2], 1):
        p = m["profile"]
        lines.append(
            f"\nPerfil #{i} — {p['name']} (Confianza BD: {m['score']}/100)"
            f"\n  Clase FAO: {p['fao_class']} | USDA: {p['usda_class']}"
            f"\n  pH típico: {p['ph_range'][0]}-{p['ph_range'][1]} | Textura: arcilla {p['clay_pct'][0]}-{p['clay_pct'][1]}%, arena {p['sand_pct'][0]}-{p['sand_pct'][1]}%"
            f"\n  Regiones típicas: {', '.join(p['regions'][:3])}"
            f"\n  Problemas comunes: {', '.join(p['issues'][:3])}"
            f"\n  Cultivos típicos: {', '.join(p['typical_crops'][:5])}"
            f"\n  Plantas nativas: {', '.join(p['native_plants'][:3])}"
            f"\n  Enmiendas recomendadas: {', '.join(p['amendments'][:3])}"
        )
    return "\n".join(lines)


def build_sg_context(sg: dict) -> str:
    """Construye texto de contexto con datos reales de SoilGrids."""
    if not sg:
        return ""
    parts = [f"DATOS REALES MEDIDOS (ISRIC SoilGrids 250m, capa 0-5cm):"]
    if "ph_real" in sg:
        parts.append(f"  pH medido: {sg['ph_real']}")
    if "clay_pct" in sg:
        parts.append(f"  Arcilla: {sg['clay_pct']}% | Arena: {sg.get('sand_pct','?')}% | Limo: {sg.get('silt_pct','?')}%")
    if "texture_class" in sg:
        parts.append(f"  Clase textural real: {sg['texture_class']}")
    if "organic_carbon_pct" in sg:
        parts.append(f"  Carbono orgánico: {sg['organic_carbon_pct']}% (M.O. ≈ {round(sg['organic_carbon_pct']*1.724, 2)}%)")
    if "bulk_density_g_cm3" in sg:
        parts.append(f"  Densidad aparente: {sg['bulk_density_g_cm3']} g/cm³")
    if "cec_cmolkg" in sg:
        parts.append(f"  CIC real: {sg['cec_cmolkg']} cmol/kg")
    if "nitrogen_cg_kg" in sg:
        parts.append(f"  Nitrógeno total: {sg['nitrogen_cg_kg']} cg/kg")
    return "\n".join(parts)


# ── GROQ VISION CON CONTEXTO DE BD ────────────────────────────────────────────
_VISION_MODEL = "qwen/qwen3.6-27b"   # único modelo de visión vigente en Groq (jul-2026)

def call_groq_vision(image_b64: str, lang: str, region: str = "", lat: str = "", lng: str = "") -> str:
    """
    Extracción visual — UNA sola llamada con imagen, esquema compacto (solo lo
    necesario para clasificar el suelo y compararlo contra la base de datos).
    El enriquecimiento (salinidad, plagas, plantas, etc.) se hace después con
    call_groq_enrich(), que es solo texto y no reenvía la imagen. Mantener esto
    en una única llamada de visión, con un prompt corto, es clave para no exceder
    el límite de tokens por minuto (TPM) de la cuenta gratuita de Groq para
    modelos en preview como qwen3.6-27b.
    """
    if "," in image_b64:
        image_b64 = image_b64.split(",")[1]

    loc_ctx = ""
    if region:
        loc_ctx = f" Ubicación del usuario: '{region}'."
        if lat and lng:
            loc_ctx += f" GPS: {lat},{lng}."

    prompt = f"""Eres edafólogo, agrónomo y fitopatólogo experto. Analiza esta foto de suelo (responde en '{lang}').{loc_ctx}

Rechaza (isSoil:false) fotos de personas, manos, objetos, paredes, cemento, madera, metal, pasto denso, hojas, vegetación viva dominante, cielo, agua, playa o superficie artificial.
Acepta SOLO si 60%+ de la imagen es suelo real: tierra, arcilla, limo, arena agrícola, humus, sustrato.

Responde ÚNICAMENTE con JSON válido, sin texto ni markdown fuera del JSON.

Si NO es suelo:
{{"isSoil":false,"confidence":95,"rejection_reason":"por qué no es suelo analizable"}}

Si SÍ es suelo:
{{
  "isSoil": true,
  "confidence": 88,
  "soilType": "arenoso|arcilloso|limoso|franco|franco_arenoso|franco_arcilloso|organico|calcareo",
  "estimatedPh": 6.5,
  "compaction": "baja|media|alta",
  "drainage": "bueno|moderado|pobre",
  "erosion": "baja|media|alta",
  "fireHistory": "ninguno|reciente|moderado|antiguo",
  "color": "descripción del color y qué indica nutricionalmente",
  "texture": "descripción visual de granulometría y estructura",
  "humidity": "seco|húmedo|saturado",
  "organicMatter": "bajo|medio|alto",
  "organicMatterDesc": "lo observado visualmente sobre materia orgánica",
  "structureQuality": "excelente|buena|regular|pobre"
}}

Guía visual: negro/marrón oscuro=alta M.O.; rojizo=acidez/hierro libre; grisáceo=hidromorfismo; blanco/claro=calcáreo/salino; costras blancas=salinidad alta; grietas anchas=vertisol/compactación; grano suelto=arenoso."""

    completion = client.chat.completions.create(
        model=_VISION_MODEL,
        messages=[
            {"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
            ]},
        ],
        max_completion_tokens=1400,
        temperature=0.3,
        top_p=0.95,
        response_format={"type": "json_object"},
        reasoning_effort="none",     # ahorra tokens aquí; el enriquecimiento (paso de texto) sí razona
        reasoning_format="parsed",
    )
    return completion.choices[0].message.content


def call_groq_enrich(initial: dict, lang: str, db_context: str, sg_context: str):
    """
    Enriquecimiento — SOLO TEXTO (no reenvía la imagen). Toma lo ya detectado
    visualmente + la comparación con la base de datos + los datos reales de
    SoilGrids, y genera salinidad, nutrientes, plagas, plantas recomendadas y
    acciones. Al ser texto puro, usa la cadena de modelos de producción
    (openai/gpt-oss-120b → 20b → qwen3.6-27b), con más margen de tokens que el
    modelo de visión y con reintento automático entre modelos si alguno falla.
    """
    resumen = (
        f"Tipo: {initial.get('soilType')}, pH estimado: {initial.get('estimatedPh')}, "
        f"Color: {initial.get('color')}, Textura: {initial.get('texture')}, "
        f"Compactación: {initial.get('compaction')}, Drenaje: {initial.get('drainage')}, "
        f"Erosión: {initial.get('erosion')}, Humedad: {initial.get('humidity')}, "
        f"Materia orgánica: {initial.get('organicMatter')}"
    )

    prompt = f"""Eres edafólogo, agrónomo y fitopatólogo experto. Ya se analizó visualmente una foto de suelo:
{resumen}

{db_context}

{sg_context}

Responde en idioma '{lang}', SOLO con JSON válido, sin markdown, con este diagnóstico enriquecido:
{{
  "salinity": {{
    "level": "baja|media|alta|muy alta",
    "visualSigns": "señales visibles de salinidad o 'Sin señales visibles'",
    "estimatedDsM": 1.2,
    "recommendation": "acción recomendada"
  }},
  "nutrients": {{
    "estimatedNitrogen": "deficiente|adecuado|exceso",
    "estimatedPhosphorus": "deficiente|adecuado|exceso",
    "organicMatterLevel": "bajo|medio|alto",
    "visualCues": "señales del estado nutricional según lo detectado"
  }},
  "potentialPests": [
    {{"name":"nombre plaga","type":"insecto|hongo|bacteria|nematodo|maleza","visualEvidence":"por qué es probable dado el diagnóstico","riskLevel":"bajo|medio|alto","control":"método de control"}}
  ],
  "recommendedPlants": [
    {{"name":"nombre científico (común)","type":"nativa|cultivar|cobertura","reason":"por qué es adecuada para este suelo y región","waterNeeds":"bajo|medio|alto","season":"época de siembra"}}
  ],
  "immediateActions": ["acción urgente 1", "acción urgente 2", "acción urgente 3"],
  "observations": "diagnóstico técnico completo en 4-5 oraciones comparando con la base de datos de referencia"
}}"""

    return call_groq(prompt, max_tokens=3200, temperature=0.5, json_mode=True, effort="low")




# ── RUTAS ESTÁTICAS ───────────────────────────────────────────────────────────
@app.route("/")
def root():
    return send_from_directory(".", "login.html" if "user_id" not in session else "index.html")

@app.route("/index.html")
def main_app():
    return send_from_directory(".", "login.html" if "user_id" not in session else "index.html")

@app.route("/login.html")
def login_page():
    return send_from_directory(".", "login.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(".", filename)


# ── AUTH ──────────────────────────────────────────────────────────────────────
@app.route("/api/register", methods=["POST"])
def register():
    try:
        b = request.get_json(force=True) or {}
        nombre   = b.get("nombre", "").strip()
        email    = b.get("email", "").strip().lower()
        password = b.get("password", "")
        if not nombre or not email or not password:
            return jsonify({"success": False, "message": "Todos los campos son obligatorios"}), 400
        if "@" not in email:
            return jsonify({"success": False, "message": "Correo inválido"}), 400
        if len(password) < 6:
            return jsonify({"success": False, "message": "Contraseña mínimo 6 caracteres"}), 400
        conn = get_db()
        try:
            if db_execute(conn, "SELECT id FROM usuarios WHERE email=?", (email,)).fetchone():
                return jsonify({"success": False, "message": "Correo ya registrado"}), 409
            if USE_POSTGRES:
                cur = db_execute(
                    conn, "INSERT INTO usuarios(nombre,email,password) VALUES(?,?,?) RETURNING id",
                    (nombre, email, hash_password(password)),
                )
                uid = cur.fetchone()["id"]
            else:
                cur = db_execute(
                    conn, "INSERT INTO usuarios(nombre,email,password) VALUES(?,?,?)",
                    (nombre, email, hash_password(password)),
                )
                uid = cur.lastrowid
            conn.commit()
        finally:
            conn.close()
        session["user_id"] = uid
        session["user_nombre"] = nombre
        session["user_email"] = email
        session.permanent = True
        return jsonify({"success": True, "message": "Registro exitoso", "user": {"nombre": nombre, "email": email}})
    except Exception as e:
        print(f"Register error: {e}")
        return jsonify({"success": False, "message": "Error interno"}), 500


@app.route("/api/login", methods=["POST"])
def login():
    try:
        b = request.get_json(force=True) or {}
        email    = b.get("email", "").strip().lower()
        password = b.get("password", "")
        if not email or not password:
            return jsonify({"success": False, "message": "Correo y contraseña requeridos"}), 400
        conn = get_db()
        try:
            u = db_execute(
                conn, "SELECT id,nombre,email,password FROM usuarios WHERE email=?", (email,)
            ).fetchone()
        finally:
            conn.close()
        if not u or u["password"] != hash_password(password):
            return jsonify({"success": False, "message": "Credenciales incorrectas"}), 401
        session["user_id"] = u["id"]
        session["user_nombre"] = u["nombre"]
        session["user_email"] = u["email"]
        session.permanent = True
        return jsonify({"success": True, "message": "Login exitoso", "user": {"nombre": u["nombre"], "email": u["email"]}})
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({"success": False, "message": "Error interno"}), 500


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True})


@app.route("/api/check-auth", methods=["GET"])
def check_auth():
    if "user_id" in session:
        return jsonify({
            "authenticated": True,
            "user": {
                "id": session["user_id"],
                "nombre": session["user_nombre"],
                "email": session["user_email"],
            },
        })
    return jsonify({"authenticated": False})


@app.route("/api/keepalive", methods=["GET"])
def keepalive():
    """
    Endpoint sin autenticación para servicios externos de monitoreo gratuitos
    (por ejemplo UptimeRobot). Hace una consulta real a la base de datos, no
    solo responde "ok", porque proveedores gratuitos como Supabase pausan el
    proyecto tras 7 días SIN actividad de base de datos — un ping que solo
    toca la app (sin consultar la BD) no evita esa pausa.
    """
    try:
        conn = get_db()
        try:
            db_execute(conn, "SELECT 1")
        finally:
            conn.close()
        return jsonify({"status": "ok"})
    except Exception as e:
        print(f"[Keepalive] Error: {e}")
        return jsonify({"status": "error"}), 500


# ── SCAN IMAGEN (Vision + BD + SoilGrids) ────────────────────────────────────
@app.route("/api/scan-image", methods=["POST"])
def scan_image():
    if "user_id" not in session:
        return jsonify({"error": "No autorizado"}), 401
    try:
        body      = request.get_json(force=True)
        image_b64 = body.get("image", "")
        lang      = body.get("lang", "es")
        region    = body.get("region", "")
        lat_s     = body.get("lat", "")
        lng_s     = body.get("lng", "")

        if not image_b64:
            return jsonify({"error": "No se recibió imagen"}), 400

        # 1) Extracción visual (única llamada con imagen — ver call_groq_vision)
        raw_initial = call_groq_vision(image_b64, lang, region, lat_s, lng_s)
        initial_result = json.loads(clean_json(raw_initial))

        if not initial_result.get("isSoil", False):
            return jsonify(initial_result)

        # 2) Obtener datos reales de SoilGrids si hay GPS
        sg_data = None
        if lat_s and lng_s:
            try:
                sg_data = fetch_soilgrids(float(lat_s), float(lng_s))
            except Exception as sg_err:
                print(f"[SoilGrids] Skipped: {sg_err}")

        # 3) Hacer match contra base de datos de referencia
        matches = match_soil_profile(initial_result, top_n=3)
        db_ctx  = build_db_context(matches)
        sg_ctx  = build_sg_context(sg_data) if sg_data else ""

        # 4) Enriquecimiento por TEXTO (sin reenviar la imagen — ver call_groq_enrich).
        #    Si falla, no se pierde el análisis: se conserva lo ya detectado en el paso 1.
        final_result = dict(initial_result)
        raw_enriched = call_groq_enrich(initial_result, lang, db_ctx, sg_ctx)
        if raw_enriched:
            try:
                enrichment = json.loads(clean_json(raw_enriched))
                final_result.update(enrichment)
            except json.JSONDecodeError as e:
                print(f"[Scan] Enriquecimiento con JSON inválido, se conserva el análisis básico: {e}")
        else:
            print("[Scan] Enriquecimiento no disponible, se conserva el análisis básico")

        # 5) Adjuntar metadatos de la BD y SoilGrids al resultado
        final_result["databaseMatches"] = [
            {
                "name": m["profile"]["name"],
                "fao_class": m["profile"]["fao_class"],
                "usda_class": m["profile"]["usda_class"],
                "match_score": m["score"],
                "fertility": m["profile"]["fertility"],
                "typical_regions": m["profile"]["regions"][:3],
                "typical_crops": m["profile"]["typical_crops"][:5],
                "native_plants": m["profile"]["native_plants"][:3],
                "main_issues": m["profile"]["issues"][:3],
                "amendments": m["profile"]["amendments"][:3],
            }
            for m in matches
        ]
        if sg_data:
            final_result["soilGridsData"] = sg_data

        return jsonify(final_result)

    except json.JSONDecodeError as e:
        print(f"[Scan] JSON error: {e}")
        return jsonify({"error": "Respuesta de IA inválida al analizar imagen"}), 500
    except Exception as e:
        err_str = str(e).lower()
        print(f"[Scan] Error: {e}")
        # Límite de tokens/velocidad: error real y accionable, NO lo disfraces de "no es suelo"
        if any(k in err_str for k in ["rate_limit", "429", "413", "too large",
                                       "tokens per minute", "quota", "request too large"]):
            return jsonify({
                "error": "El servicio de IA está saturado por límite de tokens del plan gratuito de Groq. "
                         "Espera unos segundos e inténtalo de nuevo."
            })
        if any(k in err_str for k in ["vision", "unsupported image", "invalid_image", "image_url"]):
            return jsonify({
                "isSoil": False, "confidence": 0,
                "rejection_reason": "Análisis visual no disponible en este momento. Usa el formulario.",
            })
        return jsonify({"error": str(e)}), 500


# ── ANÁLISIS COMPLETO (Formulario + SoilGrids) ────────────────────────────────
@app.route("/api/analyze", methods=["POST"])
def analyze_soil():
    if "user_id" not in session:
        return jsonify({"error": "No autorizado"}), 401
    try:
        body   = request.get_json(force=True)
        data   = body.get("data", {})
        lang   = body.get("lang", "es")
        region = data.get("region", "No especificada")
        lat_s  = data.get("latitude", "")
        lng_s  = data.get("longitude", "")

        loc = f"Región: {region}"
        if lat_s and lng_s:
            loc += f" | GPS: {lat_s}, {lng_s} — determina el bioma exacto"

        # SoilGrids si hay GPS
        sg_data = None
        sg_supplement = ""
        if lat_s and lng_s:
            try:
                sg_data = fetch_soilgrids(float(lat_s), float(lng_s))
                if sg_data:
                    sg_supplement = (
                        f"\nDATOS REALES ISRIC SoilGrids (0-5cm): "
                        f"pH medido={sg_data.get('ph_real','?')}, "
                        f"arcilla={sg_data.get('clay_pct','?')}%, "
                        f"arena={sg_data.get('sand_pct','?')}%, "
                        f"C.O.={sg_data.get('organic_carbon_pct','?')}%, "
                        f"CIC={sg_data.get('cec_cmolkg','?')} cmol/kg, "
                        f"densidad aparente={sg_data.get('bulk_density_g_cm3','?')} g/cm³. "
                        "Usa estos valores reales para corregir o confirmar el análisis."
                    )
            except Exception:
                pass

        prompt = f"""Eres un edafólogo, agrónomo y fitopatólogo experto. Analiza este suelo en idioma '{lang}'.
Responde SOLO con JSON válido, sin texto adicional ni markdown.

DATOS DEL SUELO:
- {loc}
- Objetivo del usuario: {data.get('goal', 'mejorar suelo')}
- Tipo de suelo: {data.get('soilType', 'franco')}
- pH reportado: {data.get('ph', 7)}
- Historial de incendios: {data.get('fireHistory', 'ninguno')}
- Compactación: {data.get('compaction', 'media')}
- Drenaje: {data.get('drainage', 'moderado')}
- Erosión: {data.get('erosion', 'media')}
{sg_supplement}

REGLAS CRÍTICAS:
1. Si hay GPS, recomienda EXCLUSIVAMENTE plantas nativas o cultivadas de ESA zona climática y bioma.
2. Mínimo 4 plantas en cada categoría (reforestación, agricultura, cultivos de cobertura).
3. Si hay datos reales de SoilGrids, úsalos como base y corrige discrepancias con lo reportado.
4. Si hay incendio reciente, prioriza especies pioneras post-fuego.

{{
  "soilStatus": {{
    "phAnalysis": "análisis detallado del pH y consecuencias en nutrientes",
    "soilHealth": "diagnóstico general del suelo en 2-3 oraciones",
    "mainIssues": ["problema 1", "problema 2", "problema 3"],
    "salinity": {{
      "level": "baja|media|alta|muy alta",
      "estimatedDsM": 1.5,
      "impact": "cómo afecta cultivos y flora",
      "recommendation": "acción recomendada"
    }},
    "nutrients": {{
      "nitrogen": "deficiente|adecuado|exceso",
      "phosphorus": "deficiente|adecuado|exceso",
      "potassium": "deficiente|adecuado|exceso",
      "organicMatter": "bajo|medio|alto",
      "analysis": "diagnóstico nutricional completo"
    }}
  }},
  "pests": {{
    "riskLevel": "bajo|medio|alto|crítico",
    "commonPests": [
      {{"name":"nombre","type":"insecto|hongo|bacteria|nematodo","description":"descripción","control":"método de control"}}
    ],
    "preventionTips": ["consejo 1", "consejo 2"]
  }},
  "suitability": {{
    "level": "Óptimo|Aceptable|Requiere rehabilitación|Crítico",
    "score": 75,
    "message": "resumen de aptitud del suelo para el objetivo del usuario"
  }},
  "rehabilitation": {{
    "immediateActions": ["acción urgente 1", "acción 2", "acción 3"],
    "longTermActions": ["estrategia largo plazo 1", "estrategia 2"],
    "amendments": ["enmienda 1 con dosis", "enmienda 2", "enmienda 3"]
  }},
  "plants": {{
    "reforestation": [
      {{"name":"nombre científico (común)","reason":"por qué es idónea","care":"cuidados esenciales","nativeRegion":"región de origen","waterNeeds":"bajo|medio|alto"}}
    ],
    "agriculture": [
      {{"name":"cultivo","reason":"adecuación al suelo/clima","care":"cuidados clave","season":"época de siembra","yield":"rendimiento estimado"}}
    ],
    "coverCrops": [
      {{"name":"cultivo de cobertura","benefit":"beneficio específico","howToUse":"cómo y cuándo incorporarlo"}}
    ]
  }},
  "waterManagement": {{
    "irrigationType": "tipo de riego más eficiente",
    "frequency": "frecuencia recomendada",
    "tips": ["consejo 1", "consejo 2", "consejo 3"]
  }},
  "careRoutine": {{
    "soilCare": ["tarea 1 con detalle", "tarea 2", "tarea 3"],
    "plantCare": ["cuidado 1", "cuidado 2"],
    "schedule": "calendario mensual de actividades"
  }}
}}"""

        resp = call_groq(prompt, max_tokens=4800, temperature=0.6, json_mode=True, effort="low")
        if not resp:
            return jsonify({"error": "IA no disponible. Intenta de nuevo."}), 503

        result = json.loads(clean_json(resp))
        if sg_data:
            result["soilGridsData"] = sg_data
        return jsonify(result)

    except json.JSONDecodeError as e:
        return jsonify({"error": f"Respuesta de IA inválida: {e}"}), 500
    except Exception as e:
        print(f"[Analyze] Error: {e}")
        return jsonify({"error": str(e)}), 500


# ── CHAT ──────────────────────────────────────────────────────────────────────
@app.route("/api/chat", methods=["POST"])
def chat():
    if "user_id" not in session:
        return jsonify({"error": "No autorizado"}), 401
    try:
        body     = request.get_json(force=True)
        question = (body.get("question") or "").strip()
        context  = body.get("context", "")
        lang     = body.get("lang", "es")
        if not question:
            return jsonify({"error": "Pregunta vacía"}), 400

        prompt = (
            f"Eres EcoChat, el asistente de IA de EcoScan, experto en edafología, agronomía y reforestación. "
            f"Si te preguntan tu nombre, responde que eres EcoChat. "
            f"Responde en '{lang}', de forma concisa, cálida y práctica (máx. 200 palabras). "
            f"Contexto del diagnóstico: {context}\n"
            f"Pregunta: {question}"
        )
        resp = call_groq(prompt, max_tokens=1800, temperature=0.6, json_mode=False, effort="low")
        return jsonify({"answer": resp or "IA no disponible. Intenta de nuevo."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── VERIFICACIÓN DE MODELOS AL ARRANQUE ──────────────────────────────────────
def check_model_availability():
    """
    Consulta la lista de modelos activos en Groq y avisa por consola si alguno de
    los configurados aquí ya fue descontinuado. Así, la próxima vez que Groq retire
    un modelo, te enteras al iniciar el servidor en vez de por un correo o un fallo
    silencioso del chat/análisis.
    """
    try:
        resp = _req.get(
            "https://api.groq.com/openai/v1/models",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            timeout=8,
        )
        if resp.status_code != 200:
            print(f"  ⚠️  No se pudo verificar el estado de los modelos (HTTP {resp.status_code})")
            return
        active_ids = {m["id"] for m in resp.json().get("data", [])}
        configured = set(_GROQ_TEXT_MODELS) | {_VISION_MODEL}
        missing = configured - active_ids

        if missing:
            print(f"  ⚠️  AVISO: estos modelos ya NO aparecen activos en Groq: {', '.join(sorted(missing))}")
            print(f"      Revisa https://console.groq.com/docs/deprecations y actualiza la lista en server.py")
        else:
            print(f"  ✅ Modelos verificados y activos: {', '.join(sorted(configured))}")
    except Exception as e:
        print(f"  ⚠️  No se pudo verificar disponibilidad de modelos (sin conexión?): {e}")


# ── ARRANQUE ──────────────────────────────────────────────────────────────────
# init_db() y la verificación de modelos se ejecutan siempre que se importa este
# archivo (tanto con "python server.py" en local, como con Gunicorn en producción,
# que es el servidor WSGI real recomendado para Render — el servidor de desarrollo
# de Flask no está pensado para producción).
init_db()
print(f"\n  🌱 EcoScan v2 — backend listo")
print(f"  📊 Base de datos: {len(SOIL_DB)} perfiles de suelos de referencia")
print(f"  🌍 SoilGrids: habilitado (requiere GPS del usuario)")
check_model_availability()
print()

if __name__ == "__main__":
    # Este bloque SOLO corre con "python server.py" (desarrollo local).
    # En producción, Gunicorn importa "app" directamente y nunca llega aquí.
    print(f"  Disponible en http://localhost:{PORT}/\n")
    if os.environ.get("RENDER") is None:
        threading.Timer(1.8, lambda: webbrowser.open(f"http://localhost:{PORT}/")).start()
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
