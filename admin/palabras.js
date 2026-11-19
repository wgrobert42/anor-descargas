/* palabras.js — palabras cortas en español (sin tildes ni ñ) para las contraseñas que genera el panel:
   tres palabras al azar + dos cifras, por ejemplo «luna-pato-73». Con unas 370 palabras son unos 32 bits de azar: más que
   suficiente porque Firebase bloquea los intentos repetidos, y fáciles de dictar o escribir en el móvil. */
'use strict';
window.PALABRAS = [
  'abeja', 'abril', 'agua', 'aire', 'ajo', 'ala', 'alba', 'alma', 'alto', 'amigo', 'ancla', 'anillo', 'arbol', 'arco', 'arena', 'arroz',
  'atlas', 'aula', 'avena', 'ave', 'azul', 'bahia', 'balon', 'banco', 'barco', 'barro', 'base', 'baul', 'beso', 'bici', 'boca', 'bola',
  'bolso', 'bosque', 'bota', 'brazo', 'brisa', 'bruma', 'buho', 'burro', 'caballo', 'cabra', 'cacao', 'cafe', 'caja', 'calle', 'cama', 'campo',
  'canal', 'canto', 'capa', 'cara', 'carta', 'casa', 'castor', 'cebra', 'cena', 'cereza', 'cerro', 'cielo', 'cine', 'cinta', 'circo', 'cisne',
  'clavo', 'cobre', 'coche', 'cofre', 'cohete', 'cola', 'color', 'copa', 'coral', 'corona', 'costa', 'crema', 'cubo', 'cuento', 'cuerda', 'dado',
  'dama', 'dedo', 'delfin', 'diente', 'disco', 'dulce', 'duna', 'eco', 'faro', 'fiesta', 'flor', 'foca', 'fresa', 'fruta', 'fuego', 'fuente',
  'gafas', 'gallo', 'ganso', 'gato', 'gema', 'globo', 'gorra', 'gota', 'grano', 'grillo', 'grupo', 'guante', 'haba', 'hada', 'hielo', 'hierba',
  'higo', 'hilo', 'hoja', 'hongo', 'horno', 'huerto', 'huevo', 'humo', 'iglu', 'isla', 'jardin', 'jarra', 'joya', 'juego', 'jugo', 'kiwi',
  'lago', 'lana', 'lapiz', 'lata', 'lazo', 'leche', 'leon', 'libro', 'lima', 'limon', 'lince', 'lirio', 'lobo', 'lomo', 'loro', 'luna',
  'luz', 'madera', 'maiz', 'mango', 'mano', 'manta', 'mapa', 'mar', 'marco', 'mesa', 'miel', 'mina', 'mono', 'monte', 'mora', 'moto',
  'mundo', 'museo', 'nabo', 'nariz', 'nave', 'nido', 'nieve', 'noche', 'norte', 'nube', 'nuez', 'oasis', 'ola', 'olivo', 'olla', 'onda',
  'oro', 'oso', 'otono', 'oveja', 'padre', 'pala', 'palma', 'pan', 'papel', 'parque', 'pato', 'pavo', 'paz', 'pera', 'perla', 'perro',
  'pez', 'piano', 'pico', 'pie', 'piedra', 'pino', 'pinta', 'pipa', 'pista', 'plata', 'playa', 'plaza', 'pluma', 'polo', 'pozo', 'prado',
  'puente', 'puerta', 'puma', 'punto', 'queso', 'radio', 'rama', 'rana', 'rayo', 'red', 'regalo', 'reloj', 'rey', 'rio', 'risa', 'roca',
  'rosa', 'rubi', 'rueda', 'ruta', 'sal', 'salto', 'sapo', 'selva', 'seta', 'silla', 'sol', 'sombra', 'sopa', 'suelo', 'sueno', 'taza',
  'te', 'techo', 'tela', 'tigre', 'tinta', 'toro', 'torre', 'tren', 'trigo', 'trueno', 'tubo', 'tuna', 'uva', 'vaca', 'valle', 'vaso',
  'vela', 'verano', 'verde', 'viento', 'vino', 'violin', 'yate', 'yema', 'yeso', 'yogur', 'zapato', 'zorro', 'zumo', 'abeto', 'acero', 'adobe',
  'aguila', 'alce', 'almeja', 'anis', 'apio', 'arbusto', 'arpa', 'asno', 'atun', 'avion', 'bambu', 'barca', 'baya', 'bisonte', 'bote', 'bufalo',
  'cabo', 'cactus', 'calamar', 'camello', 'canoa', 'carpa', 'cedro', 'cenit', 'ciervo', 'coco', 'cometa', 'cuarzo', 'datil', 'ebano', 'erizo', 'establo',
  'fideo', 'flauta', 'gacela', 'garza', 'girasol', 'granja', 'halcon', 'hamaca', 'helado', 'hiena', 'iman', 'jabali', 'jaguar', 'jazmin', 'kayak', 'koala',
  'laurel', 'lechuga', 'lenteja', 'liebre', 'llama', 'lluvia', 'loma', 'lupa', 'malva', 'manzana', 'mapache', 'medusa', 'melon', 'menta', 'mirlo', 'molino',
  'morsa', 'musgo', 'naranja', 'nectar', 'nogal', 'nutria', 'orca', 'ostra', 'palmera', 'panda', 'papaya', 'patio', 'pepino', 'pinguino', 'pomelo', 'pulpo',
  'quinoa', 'rabano', 'ribera', 'roble', 'salmon', 'sandia', 'sauce', 'sierra', 'surco', 'tapir', 'tomate', 'trebol', 'tulipan', 'urraca', 'velero', 'zafiro'
];
