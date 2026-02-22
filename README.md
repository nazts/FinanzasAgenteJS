# 💰 FinanzasAgenteJS

> Bot de Telegram para finanzas personales con IA · Regla 50/30/20 · Node.js 20+ · ESM

---

## 📋 Descripción

**FinanzasAgenteJS** es un asistente de finanzas personales en Telegram construido con Node.js. Utiliza la popular **regla 50/30/20** para ayudarte a distribuir tus ingresos de forma inteligente:

| Porcentaje | Categoría | Ejemplos |
|---|---|---|
| 🏠 50 % | Necesidades | Vivienda, alimentación, servicios, transporte |
| 🎉 30 % | Gustos | Ocio, restaurantes, suscripciones, ropa |
| 💎 20 % | Ahorro | Fondo de emergencia, inversiones, metas |

---

## ✨ Características

- 📥 **Registro de ingresos** con distribución automática 50/30/20
- 📤 **Registro de gastos** por categoría (necesidad / gusto / ahorro)
- 📊 **Resumen mensual** con desviaciones respecto al ideal
- 📈 **Gráficas visuales** (pie chart y bar chart) generadas en el bot
- 🧠 **Análisis con IA** (OpenAI GPT) — perfil de riesgo + recomendaciones personalizadas
- 🎯 **Metas de ahorro** con barra de progreso
- ⚡ **Multi-usuario** — cada Telegram ID tiene sus propios datos aislados
- 🛡️ Rate limiting integrado (30 req/min por usuario)

---

## 🛠️ Instalación

### Requisitos previos
- Node.js **20+**
- Una cuenta de Telegram y un bot creado con [@BotFather](https://t.me/BotFather)
- (Opcional) API key de OpenAI para funciones de IA

### Linux / macOS

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/FinanzasAgenteJS.git
cd FinanzasAgenteJS

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
nano .env   # edita con tu BOT_TOKEN y (opcional) OPENAI_API_KEY

# 4. Iniciar el bot
npm start
```

### Windows

```powershell
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/FinanzasAgenteJS.git
cd FinanzasAgenteJS

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
copy .env.example .env
notepad .env   # edita con tu BOT_TOKEN y (opcional) OPENAI_API_KEY

# 4. Iniciar el bot
npm start
```

---

## ⚙️ Configuración

Edita el archivo `.env`:

```env
BOT_TOKEN=123456789:ABCdef...          # Obligatorio — token de BotFather
OPENAI_API_KEY=sk-...                  # Opcional — habilita funciones de IA
DATABASE_PATH=./data/finanzas.db       # Ruta a la base de datos SQLite
NODE_ENV=development                   # development | production
```

La carpeta `data/` se crea automáticamente al iniciar el bot.

---

## 🤖 Comandos del bot

| Comando | Descripción | Ejemplo |
|---|---|---|
| `/start` | Iniciar y registrar usuario | `/start` |
| `/ingreso <monto> [desc]` | Registrar un ingreso | `/ingreso 15000 Salario` |
| `/gasto <monto> [desc]` | Registrar un gasto | `/gasto 500 Supermercado` |
| `/resumen` | Resumen del mes actual | `/resumen` |
| `/reporte` | Gráficas visuales (PNG) | `/reporte` |
| `/perfil` | Análisis de IA del perfil financiero | `/perfil` |
| `/metas` | Gestión de metas de ahorro | `/metas` |

---

## 🧠 Funciones de IA (OpenAI)

Con una `OPENAI_API_KEY` configurada:

- **Perfil de riesgo** — clasifica tu comportamiento financiero (Conservador / Moderado / Agresivo)
- **Recomendaciones personalizadas** — basadas en tus datos reales del mes
- **Respuestas contextuales** — el bot puede responder preguntas sobre tus finanzas

Sin API key, el bot funciona normalmente sin las funciones de IA.

---

## 📐 Regla 50/30/20

La regla 50/30/20 es una guía simple para gestionar el presupuesto mensual:

1. Calcula tu ingreso neto mensual total
2. Asigna el **50 %** a necesidades básicas (lo que no puedes evitar)
3. Asigna el **30 %** a gustos y deseos (lo que disfrutas)
4. Guarda el **20 %** restante como ahorro o inversión

El bot calcula automáticamente los montos ideales y te alerta cuando te desvías.

---

## 🗺️ Roadmap y Escalabilidad

### Próximas funciones
- [ ] Exportar a CSV/Excel
- [ ] Recordatorios automáticos (cron)
- [ ] Categorías personalizadas
- [ ] Comparativa histórica mes a mes

### Escalabilidad técnica
- **Base de datos**: Migración a **PostgreSQL** con **Prisma ORM** para entornos de producción multi-tenant
- **Arquitectura SaaS**: Añadir sistema de suscripciones (gratuito / premium) con Stripe
- **Open Banking**: Integración con APIs de bancos (Plaid, Belvo para LATAM) para importar movimientos automáticamente
- **Monetización**: Plan premium con análisis avanzado de IA, reportes PDF y alertas personalizadas
- **Multi-plataforma**: Portar a **WhatsApp** (Twilio), **Discord** y web app con el mismo backend
- **Infraestructura**: Containerización con Docker, despliegue en Railway / Fly.io / VPS

---

## 🤝 Contribuir

1. Haz un fork del repositorio
2. Crea una rama: `git checkout -b feature/mi-feature`
3. Realiza tus cambios y haz commit: `git commit -m "feat: descripción"`
4. Abre un Pull Request

Por favor sigue la convención de commits [Conventional Commits](https://www.conventionalcommits.org/).

---

## 📄 Licencia

MIT © 2024 — FinanzasAgenteJS
