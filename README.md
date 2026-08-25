# QSAAFrigus — backend próprio (substitui Node-RED / FlowFuse)

Faz tudo o que o teu flow atual faz — subscrever o EMQX, guardar estado, alertar
por email, gravar no InfluxDB — mas como um serviço Node.js pequeno, com
reconexão automática ao broker, logs estruturados, e uma API própria (REST +
WebSocket) para o dashboard, em vez do dashboard ligar diretamente ao broker.

## 1. Configurar

```bash
npm install
cp .env.example .env
```

Edita o `.env`:
- `BROKER_USER` / `BROKER_PASS` — as credenciais que já usas no Node-RED
- `DEVICE_IDS` — acrescenta `sensor5` quando ligares o 5º ESP32
- `SMTP_PASS` — a password/app-password da conta de email que já usas
- `INFLUX_TOKEN` — o token da tua Influx Cloud (o Node-RED já tinha isto configurado, só precisas de ir buscar o token ao painel da InfluxDB Cloud)
- `API_KEY` — inventa uma password longa; é o que o dashboard usa para falar com este serviço

## 2. Correr localmente

```bash
npm start
```

Abre `public/index.html` no browser, mete o URL `http://localhost:3000` e a `API_KEY`, clica Ligar.

## 3. Publicar no Railway (sem PC dedicado)

1. Cria um repo no GitHub com esta pasta e faz push
2. No Railway: **New Project → Deploy from GitHub repo**
3. Em **Variables**, copia todo o conteúdo do teu `.env`
4. O Railway detecta o `npm start` automaticamente
5. Depois de subir, copia o URL público (algo tipo `https://qsaafrigus-production.up.railway.app`) e usa-o no `apiUrl` do dashboard

Hospeda o `public/index.html` onde quiseres (Cloudflare Pages, GitHub Pages, ou até localmente) — ele só precisa de saber o URL do backend e a API key.

## 4. O que isto substitui no teu flow atual

| No Node-RED | Aqui |
|---|---|
| `mqtt in` + `function` (parse) | `src/mqttClient.js` + `src/deviceStore.js` |
| LEDs online/offline (60s) | `deviceStore.checkOffline()` |
| `FunctionMarada` (alerta email) | `src/alerts.js` |
| `influxdb out` | `src/influx.js` |
| `ui-form` / `ui-switch` (comandos) | `POST /api/devices/:id/command` |
| Dashboard 2.0 | `public/index.html` |

## 5. Podes desligar o FlowFuse assim que:
- Confirmares nos logs (`npm start` mostra tudo) que o backend está a receber dados dos 4 (ou 5) devices
- Receberes um email de teste (força um device offline para testar)
- Verificares no InfluxDB que os pontos novos estão a chegar com a mesma `measurement`/tags de sempre — os teus dashboards Influx/Grafana antigos continuam a funcionar sem alterações
