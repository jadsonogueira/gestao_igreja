# Sistema de Automação de Envios - Igreja App

## 📋 Visão Geral

Este sistema permite que os emails sejam enviados **automaticamente** nos horários programados para cada grupo, sem necessidade de intervenção manual.

## 🎯 Funcionalidades

### 1. Verificação Automática (Scheduler)
- ✅ Verifica a cada **1 minuto** se há grupos com envio programado
- ✅ Considera o fuso horário de **São Paulo (UTC-3)**
- ✅ Respeita os horários e dias configurados para cada grupo
- ✅ Evita envios duplicados no mesmo dia
- ✅ Processa a fila de emails (1 por minuto) automaticamente

### 2. Chave Liga/Desliga
- ✅ Controle visual na página "Gerenciamento de Envios"
- ✅ Permite pausar/ativar a automação sem desligar o scheduler
- ✅ Armazenado no banco de dados (tabela `system_config`)

### 3. Tema Sempre Claro
- ✅ Forçado tema claro em todos os navegadores
- ✅ Evita modo escuro automático do sistema operacional

## 🚀 Como Iniciar o Scheduler

### Opção 1: Iniciar Manualmente (Desenvolvimento)

```bash
cd /home/ubuntu/igreja_gestao_membros/nextjs_space
node scheduler.js
```

### Opção 2: Iniciar com PM2 (Produção Recomendada)

```bash
# Instalar PM2 globalmente (se não tiver)
npm install -g pm2

# Iniciar o scheduler
cd /home/ubuntu/igreja_gestao_membros/nextjs_space
pm2 start scheduler.js --name "igreja-scheduler"

# Ver logs
pm2 logs igreja-scheduler

# Parar o scheduler
pm2 stop igreja-scheduler

# Reiniciar o scheduler
pm2 restart igreja-scheduler

# Configurar para iniciar automaticamente no boot
pm2 startup
pm2 save
```

### Opção 3: Systemd Service (Linux)

Criar arquivo `/etc/systemd/system/igreja-scheduler.service`:

```ini
[Unit]
Description=Igreja Email Scheduler
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/igreja_gestao_membros/nextjs_space
ExecStart=/usr/bin/node /home/ubuntu/igreja_gestao_membros/nextjs_space/scheduler.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=APP_URL=https://igreja-gestao-membro-l1ymra.abacusai.app

[Install]
WantedBy=multi-user.target
```

Ativar o serviço:

```bash
sudo systemctl enable igreja-scheduler
sudo systemctl start igreja-scheduler
sudo systemctl status igreja-scheduler

# Ver logs
sudo journalctl -u igreja-scheduler -f
```

## 📊 Configurações dos Grupos

Cada grupo pode ter os seguintes parâmetros:

| Parâmetro | Descrição | Exemplo |
|-----------|-----------|---------|
| **frequenciaEnvio** | Tipo de frequência | `aniversario`, `diaria`, `semanal`, `mensal` |
| **horaEnvio** | Hora do envio (0-23) | `9` (9h da manhã) |
| **minutoEnvio** | Minuto do envio (0, 15, 30, 45) | `30` (9h30) |
| **diaSemana** | Dia da semana (apenas semanal, 0-6) | `1` (Segunda-feira) |
| **diaMes** | Dia do mês (apenas mensal, 1-31) | `15` (dia 15) |
| **ativo** | Grupo ativo | `true` ou `false` |

### Exemplos:

**1. Aniversário (Diário às 9h)**
```
frequenciaEnvio: "aniversario"
horaEnvio: 9
minutoEnvio: 0
```

**2. Pastoral (Toda Segunda às 10h30)**
```
frequenciaEnvio: "semanal"
diaSemana: 1
horaEnvio: 10
minutoEnvio: 30
```

**3. Devocional (Diário às 7h15)**
```
frequenciaEnvio: "diaria"
horaEnvio: 7
minutoEnvio: 15
```

**4. Visitantes (Dia 1 de cada mês às 14h)**
```
frequenciaEnvio: "mensal"
diaMes: 1
horaEnvio: 14
minutoEnvio: 0
```

## 🔧 Controle da Automação (UI)

Na página **"Gerenciamento de Envios"** você verá:

```
┌─────────────────────────────────────────────┐
│  🟢 Automação de Envios                     │
│                                             │
│  A automação está ativa. Os grupos serão   │
│  enviados automaticamente nos horários     │
│  programados.                               │
│                                             │
│  [🔴 Desativar]                            │
└─────────────────────────────────────────────┘
```

- **Verde + "Desativar"**: Automação ativa
- **Cinza + "Ativar"**: Automação desativada

## 🔍 Logs e Monitoramento

O scheduler gera logs detalhados:

```
[Scheduler] 2025-01-14T12:30:00.000Z - Verificando agendamentos...
[Match] Grupo Pastoral (Semanal) - Dia: 1, Hora: 10:30
[Queued] Grupo Pastoral - 5 emails agendados
[Queue] Processando... (4 restantes)
[Queue] ✓ Fila de emails processada completamente
```

### Ver Logs em Tempo Real:

**Com PM2:**
```bash
pm2 logs igreja-scheduler --lines 100
```

**Com Systemd:**
```bash
sudo journalctl -u igreja-scheduler -f
```

**Manual:**
```bash
# Os logs aparecem direto no terminal onde você iniciou o scheduler
```

## 🛠️ Troubleshooting

### Problema: Scheduler não inicia

**Solução:**
```bash
# Verificar se a porta 3000 está em uso
lsof -i :3000

# Verificar se o app Next.js está rodando
curl http://localhost:3000/api/config
```

### Problema: Emails não são enviados automaticamente

**Verificar:**
1. ✅ Scheduler está rodando? (`pm2 list` ou `systemctl status igreja-scheduler`)
2. ✅ Automação está ativa? (Verificar UI ou banco de dados)
3. ✅ Horário está correto? (Verificar logs do scheduler)
4. ✅ Grupo está ativo? (`ativo = true` no banco)
5. ✅ Já foi enviado hoje? (Verificar `ultimoEnvio` do grupo)

### Problema: Erro de conexão com a API

**Solução:**
```bash
# Atualizar a URL da aplicação
export APP_URL=https://igreja-gestao-membro-l1ymra.abacusai.app

# Ou editar o scheduler.js e alterar a linha:
# const APP_URL = 'https://sua-url-aqui';
```

## 📝 Estrutura do Banco de Dados

### Tabela `system_config`
```sql
CREATE TABLE system_config (
  id TEXT PRIMARY KEY,
  automacao_ativa BOOLEAN DEFAULT true,
  ultima_verificacao TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Tabela `message_groups`
```sql
-- Campos relevantes para automação
nome_grupo TEXT UNIQUE,
frequencia_envio TEXT,
dia_semana INTEGER,
dia_mes INTEGER,
hora_envio INTEGER DEFAULT 9,
minuto_envio INTEGER DEFAULT 0,
ultimo_envio TIMESTAMP,
ativo BOOLEAN DEFAULT true
```

## 🎉 Pronto!

Agora o sistema está completamente automatizado. Os emails serão enviados automaticamente nos horários programados, e você pode controlar a automação pela interface web.

**Importante:** Mantenha o scheduler rodando em segundo plano para que a automação funcione!
