#!/usr/bin/env bash
#
# Migração de produção do AgenteIA Edital.
#
#   cd /opt/agente-edital
#   git pull
#   chmod +x migrar_producao.sh
#   ./migrar_producao.sh
#
# O que ele faz, nesta ordem, parando no primeiro erro:
#   1. lê o DATABASE_URL do backend/.env  (é por isso que `psql "$DATABASE_URL"`
#      falhava na mão: a variável não está exportada no shell, só no arquivo)
#   2. faz backup do banco — e ABORTA se não conseguir
#   3. mostra o estado atual (código x banco, e órfãos)
#   4. mostra o ENSAIO da migração e PERGUNTA antes de aplicar
#   5. aplica numa transação só
#   6. reinicia o serviço e confere se a API respondeu
#
# Nada é alterado antes da confirmação. Com --sim ele não pergunta (para quando
# você já leu o ensaio e quer repetir sem interação).
#
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$RAIZ/backend"
PY="$BACKEND/venv/bin/python"
SERVICO="agente-edital"
PORTA_API="8001"
SEM_PERGUNTA=0
[[ "${1:-}" == "--sim" ]] && SEM_PERGUNTA=1

titulo() { printf '\n\033[1m%s\033[0m\n%s\n' "$1" "$(printf '=%.0s' {1..70})"; }
ok()     { printf '  \033[32m✓\033[0m %s\n' "$1"; }
aviso()  { printf '  \033[33m!\033[0m %s\n' "$1"; }
erro()   { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- 0. sanidade
titulo "0. Conferindo o ambiente"
[[ -f "$BACKEND/.env" ]]        || erro "não achei $BACKEND/.env"
[[ -x "$PY" ]]                  || erro "não achei o Python do venv em $PY"
[[ -f "$BACKEND/migrar_fks.py" ]] || erro "não achei o migrar_fks.py — deu git pull?"
ok "venv, .env e scripts no lugar"

# O .env pode ter aspas, espaços e CRLF (se foi editado no Windows).
URL="$(grep -E '^[[:space:]]*DATABASE_URL[[:space:]]*=' "$BACKEND/.env" \
       | tail -n1 | cut -d= -f2- | tr -d '\r' \
       | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
[[ -n "$URL" ]] || erro "DATABASE_URL não encontrada em $BACKEND/.env"

# psql e pg_dump não entendem o sufixo de driver do SQLAlchemy.
URL_PSQL="${URL/postgresql+asyncpg:\/\//postgresql://}"
URL_PSQL="${URL_PSQL/postgresql+psycopg2:\/\//postgresql://}"
ok "banco: …@${URL_PSQL##*@}"

# ------------------------------------------------------------------ 1. backup
titulo "1. Backup"

# Onde escrever: $HOME nem sempre existe (cron, su -, contêiner). Se não der
# para escrever lá, cai para a raiz do projeto. Sem isto o redirecionamento
# falhava com "No such file or directory" e o script morria ANTES da mensagem
# que explica o que houve.
PASTA_BACKUP="${HOME:-}"
if [[ -z "$PASTA_BACKUP" ]] || ! mkdir -p "$PASTA_BACKUP" 2>/dev/null || [[ ! -w "$PASTA_BACKUP" ]]; then
  PASTA_BACKUP="$RAIZ"
  aviso "HOME indisponível; salvando o backup em $PASTA_BACKUP"
fi
DESTINO="$PASTA_BACKUP/backup-agente-edital-$(date +%Y%m%d-%H%M%S).sql"
LOG_ERRO="$(mktemp)"

# Nenhum comando aqui pode derrubar o script sozinho: o `set -e` faria o
# processo sumir no meio, sem chegar na checagem que avisa "SEM BACKUP".
fazer_backup() {
  if command -v pg_dump >/dev/null 2>&1; then
    if pg_dump "$URL_PSQL" > "$DESTINO" 2>"$LOG_ERRO"; then
      ok "pg_dump do host"; return 0
    fi
    aviso "pg_dump do host não deu: $(tail -n1 "$LOG_ERRO" 2>/dev/null || echo 'sem detalhe')"
  else
    aviso "pg_dump não está instalado no host"
  fi

  # O Postgres deste projeto roda em contêiner (docker-compose expõe 5445 ->
  # 5432). O pg_dump de dentro dele casa com a versão do servidor por
  # definição, então serve de rede de segurança para versão incompatível.
  if ! command -v docker >/dev/null 2>&1; then
    aviso "docker não está instalado no host"
    return 1
  fi
  local nomes container usuario banco
  nomes="$(docker ps --format '{{.Names}} {{.Image}}' 2>/dev/null || true)"
  if [[ -z "$nomes" ]]; then
    aviso "não consegui falar com o docker (daemon parado ou sem permissão)"
    return 1
  fi
  container="$(printf '%s\n' "$nomes" | grep -i -E 'postgres|_db' | head -n1 | cut -d' ' -f1 || true)"
  if [[ -z "$container" ]]; then
    aviso "nenhum contêiner de Postgres em execução"
    return 1
  fi
  usuario="$(printf '%s' "$URL_PSQL" | sed -E 's#^postgresql://([^:]+):.*#\1#')"
  banco="$(printf '%s' "$URL_PSQL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')"
  if docker exec "$container" pg_dump -U "$usuario" "$banco" > "$DESTINO" 2>"$LOG_ERRO"; then
    ok "pg_dump de dentro do contêiner $container"; return 0
  fi
  aviso "pg_dump no contêiner não deu: $(tail -n1 "$LOG_ERRO" 2>/dev/null || echo 'sem detalhe')"
  return 1
}

if ! fazer_backup || [[ ! -s "$DESTINO" ]]; then
  rm -f "$DESTINO"
  erro "SEM BACKUP — não vou migrar. Nada foi alterado.
   Gere o dump à mão e rode de novo. Um destes deve funcionar:
     pg_dump '$URL_PSQL' > ~/backup.sql
     docker exec \$(docker ps --format '{{.Names}}' | grep -i postgres) \\
       pg_dump -U <usuário> <banco> > ~/backup.sql"
fi
ok "backup: $DESTINO ($(du -h "$DESTINO" | cut -f1))"

# ------------------------------------------------------------ 2. estado atual
titulo "2. Estado atual do banco"
cd "$BACKEND"
"$PY" mapear_banco.py --so-diff || true
"$PY" checar_orfaos.py || true

# ------------------------------------------------------------------ 3. ensaio
titulo "3. Ensaio — nada será alterado"
"$PY" migrar_fks.py

# ------------------------------------------------------------ 4. confirmação
if [[ $SEM_PERGUNTA -eq 0 ]]; then
  titulo "4. Confirmação"
  cat <<'TEXTO'
  Leia o ensaio acima. Preste atenção especial em:
    - linhas "solta o vinculo": aulas que vão ficar SEM DONO
    - linhas "apaga": linhas que serão REMOVIDAS
  O backup já está feito, então dá para voltar — mas voltar significa
  restaurar o banco inteiro.
TEXTO
  printf '\n  Digite MIGRAR para aplicar (qualquer outra coisa cancela): '
  read -r RESPOSTA
  [[ "$RESPOSTA" == "MIGRAR" ]] || erro "cancelado. Nada foi alterado."
fi

# ---------------------------------------------------------------- 5. aplicar
titulo "5. Aplicando"
"$PY" migrar_fks.py --aplicar --limpar-orfaos

# --------------------------------------------------------------- 6. reiniciar
titulo "6. Reiniciando o serviço"
systemctl restart "$SERVICO"
sleep 3
systemctl is-active --quiet "$SERVICO" || {
  journalctl -u "$SERVICO" -n 30 --no-pager
  erro "o serviço não subiu. O log está acima; o backup está em $DESTINO"
}
ok "$SERVICO ativo"

# A rota /config é pública e toca o ambiente sem depender do banco; se ela
# responde, o processo está de pé. O teste do banco vem logo abaixo.
if curl -fsS --max-time 10 "http://127.0.0.1:$PORTA_API/config" >/dev/null 2>&1; then
  ok "API respondeu em 127.0.0.1:$PORTA_API"
else
  aviso "API não respondeu em /config — confira: journalctl -u $SERVICO -n 50"
fi

# ---------------------------------------------------------------- 7. conferir
titulo "7. Conferindo o resultado"
"$PY" mapear_banco.py --so-diff
"$PY" checar_orfaos.py

titulo "Pronto"
cat <<TEXTO
  Backup: $DESTINO

  Agora teste NO NAVEGADOR, nesta ordem:
    1. entrar com uma conta comum          (o 500 do login era a coluna que faltava)
    2. abrir uma aula
    3. gerar um simulado inédito e conferir se o gabarito espalha
    4. painel administrativo: excluir uma conta SEM comissão (some) e uma COM
       (fica marcada "Excluída", com botão Restaurar)

  Se algo der errado, para voltar o banco:
    psql "$URL_PSQL" < $DESTINO
TEXTO
