# Trilha de Engenharia de Dados

Plataforma de estudo interativa (SPA) para quem quer chegar ao nível **pleno** em
Engenharia de Dados. A trilha vai dos fundamentos ao nível pleno, com exercícios
corrigidos na hora e uma tarefa aplicada ao final de cada tópico. Todo o conteúdo é
ancorado no cenário fictício da empresa **TechCommerce**.

- **12 capítulos · 61 sub-tópicos · 244 níveis · 1.417 exercícios**: 920 de múltipla
  escolha, 251 de completar, 199 de escrever código e 47 de comandos de terminal.
- Cada sub-tópico tem 4 níveis (**Fundamentos → Básico → Intermediário → Pleno**),
  com conceitos-chave explicados antes das questões, links de estudo, um banner de
  contexto TechCommerce e uma tarefa final. Você só avança de nível ao acertar todas
  as questões do nível atual.
- As alternativas de múltipla escolha aparecem embaralhadas (sempre na mesma ordem
  para a mesma questão). O gabarito só aparece depois de acertar, de errar duas vezes
  ou de clicar em "Ver resposta".
- **Rodar query**: playground SQL no navegador nos tópicos de SQL (sql.js para SQL
  padrão e PGlite/PostgreSQL 16 para planos de execução).
- **Login opcional** (Supabase: link por e-mail ou Google) que guarda o progresso na
  nuvem. Sem login, tudo fica só no navegador.
- Páginas extras: **Recursos** (onde estudar cada tema), **Conquistas** (marcos,
  sequência de dias de estudo e lista de questões para revisar) e **Meu Caderno**
  (anotações por tópico, com busca).
- **HTML/CSS/JS puro (ES5), sem framework e sem build step.** O conteúdo vive em
  `data/*.json` e é carregado via `fetch()`.

## Como rodar

O app carrega o conteúdo via `fetch()`, então **precisa ser servido por HTTP**.
Abrir `index.html` como `file://` não funciona (bloqueio de CORS do navegador).

```bash
# a partir da pasta do projeto
python3 -m http.server 8000
# ou: npx serve .
```

Depois abra `http://localhost:8000/`.

Para abrir sem servidor, use o arquivo único `dist/trilha-engenharia-dados.html`
(ver [Gerar o arquivo único](#gerar-o-arquivo-único-buildjs)).

> **Cache durante o desenvolvimento:** os `fetch()` de `data/*.json` usam
> `cache: 'no-store'`, então mudanças no conteúdo aparecem ao recarregar. Para
> mudanças em `css/app.css` ou `js/*.js`, use **Ctrl+Shift+R** ou deixe o DevTools
> aberto com **Network → "Disable cache"**.

**Precisa de internet para:** fontes do Google, a biblioteca do Supabase (login), e
sql.js/PGlite (baixados da CDN na primeira vez que você clica em "Rodar"). Sem
internet, a trilha e a correção funcionam normalmente; só o login e o playground
ficam indisponíveis.

## Estrutura do repositório

```
trilha-engenharia-dados/
├── index.html                       # markup do app + <link>/<script> para css/ e js/
├── css/app.css                      # todo o CSS
├── js/app.js                        # lógica: rotas por hash, render, progresso, caderno, conquistas, sync, playground
├── js/grader.js                     # funções puras: correção, ordem das alternativas, escape (usadas também nos testes)
├── data/
│   ├── chapters.json                # capítulos, grupos e sub-tópicos (ordem = ordem de estudo)
│   ├── topics-manifest.json         # lista [{id, file}] de todos os tópicos
│   ├── topics/<pasta>/<id>.json     # um arquivo = um tópico completo
│   ├── resources.json               # página "Recursos" (filtros, seções e cards)
│   └── achievements.json            # conquistas de progresso, constância e conclusão
├── build.js                         # gera a versão single-file em dist/
├── dist/trilha-engenharia-dados.html  # SAÍDA do build (não é fonte da verdade)
└── tests/                           # checagens de correção, conteúdo e playground
```

**Fonte da verdade = `data/`, `css/`, `js/`, `index.html`.** Nunca edite
`dist/*.html` diretamente: rode `node build.js` para regenerá-lo.

A pasta em `data/topics/` não precisa coincidir com o capítulo: quem decide onde o
tópico aparece é `chapters.json`. Exemplo: os tópicos de Databricks (`dbx-1..4`)
ficam em `data/topics/cloud/`, mas aparecem no capítulo **Spark e Databricks**.

### Capítulos

| # | chave | capítulo | tópicos |
|---|---|---|---|
| 1 | `sql` | SQL avançado e modelagem de dados | p1-0 a p1-3 |
| 2 | `python` | Python para dados | py-1, py-5, py-2, py-3, py-4 |
| 3 | `cloud` | Cloud: GCP, AWS e Azure | pc-gcp-1..3, p5-4, pc-aws-1..4, pc-azure-1..4 |
| 4 | `analise` | Análise de dados e estatística | analise-1..4 |
| 5 | `etl` | Pipelines ETL/ELT | etl-1..4 |
| 6 | `iac` | Infraestrutura como código e DevOps | iac-1..4 |
| 7 | `spark` | Spark e Databricks a fundo | spark-1..4, dbx-1..4 |
| 8 | `airflow` | Orquestração com Airflow | airflow-1..4 |
| 9 | `governanca` | Governança e qualidade de dados | gov-1..4 |
| 10 | `git` | Git e CI/CD para dados | git-1..4 |
| 11 | `containers` | Docker & Kubernetes | cont-1..4 |
| 12 | `ia` | IA aplicada a dados | ia-1..4 |

### Páginas e navegação

Roteamento por `location.hash`:

| Hash | Página |
|---|---|
| `#/` (ou vazio) | Home: objetivo da trilha, números, "Requisitos para se tornar um bom engenheiro de dados" |
| `#/learning` | Aprendizado: grid dos 12 capítulos com progresso |
| `#/recursos` | Recursos: onde estudar cada tema, com filtro |
| `#/conquistas` | Conquistas: marcos, sequência de estudo, taxa de acerto na 1ª tentativa e questões para revisar |
| `#/caderno` | Meu Caderno: todas as anotações, com busca |
| `#/sobre` | Sobre: como a trilha foi construída |
| `#/capitulo/<cap>` | página do capítulo (sub-tópicos + livro recomendado) |
| `#/capitulo/<cap>/<slug>` | página do sub-tópico (níveis, exercícios e painel de anotações) |

### Progresso, histórico e login

O progresso fica em `localStorage`:

| chave | conteúdo |
|---|---|
| `trilha-dados-quiz-v2` | por tópico: nível atual, níveis concluídos, respostas (inclusive rascunho) e entregas da tarefa final |
| `trilha-dados-historico-v1` | por questão (pelo `id`): tentativas, erros, último resultado, se o gabarito foi revelado |
| `trilha-dados-conquistas-v1` | dias de estudo e conquistas já mostradas |
| `trilha-dados-caderno-v1` | anotações (exclusões ficam marcadas com `deleted` para a sincronização não trazê-las de volta) |

Cada chave tem um `<chave>-updated-at` ao lado.

**Login (opcional).** Com login, o Supabase guarda uma cópia dessas quatro chaves na
tabela `progress` (`user_id`, `key`, `data` jsonb, `updated_at`; o upsert usa a
chave única `user_id, key`, e a tabela deve ter RLS para cada usuário ver só as
próprias linhas). Ao entrar, o app busca a nuvem uma vez e **mescla**
com o navegador: une níveis concluídos e dias de estudo, fica com o maior número de
tentativas e com a versão mais recente de cada anotação. Depois disso, cada mudança é
enviada em segundo plano. O login só aparece quando o app é servido por `http(s)`.

Limite conhecido: como a mesclagem une os dois lados, **"Reiniciar tópico" em um
navegador é desfeito** se outro navegador logado ainda tiver aquele progresso.

**Supabase gratuito sem pausa.** O plano gratuito pausa o projeto depois de cerca de
7 dias sem uso. A Action `.github/workflows/supabase-keepalive.yml` faz uma consulta
leve à tabela `progress` a cada 3 dias para isso não acontecer (nada é gravado). Ela
usa a URL e a chave pública que já estão em `js/app.js`; para trocar sem editar o
arquivo, crie os secrets `SUPABASE_URL` e `SUPABASE_ANON_KEY` no repositório. Para
testar na hora: aba **Actions** > *Supabase keep-alive* > **Run workflow**. Se o projeto
já estiver pausado, clique em **Restore** no painel do Supabase antes (a Action não
reativa projeto pausado). O GitHub desliga Actions agendadas em repositórios sem
nenhum commit por 60 dias; se isso acontecer, ele avisa por e-mail e basta reativar
na aba Actions.

## Modelo de conteúdo

### Capítulos (`data/chapters.json`)

Cada chave é um capítulo, com `icon`, `eyebrow`, `title`, `intro`, uma lista de
`subtopics` (ou `groups: [{name, subtopics}]`, quando há subdivisão, como `cloud`
com GCP/AWS/Azure e `spark` com Spark/Databricks) e `book`
(`{title, author, year, level, price, why, where}`), a leitura recomendada mostrada
no fim da página do capítulo.

Cada sub-tópico: `{ topicId, slug, sub }`. O `slug` entra na URL e precisa ser
único dentro do capítulo; `sub` é a frase curta mostrada no card.

**A ordem das chaves em `chapters.json` é a ordem recomendada de estudo** e vira o
rótulo "Etapa N de 12". Cor do capítulo e conquista "Capítulo concluído" são
geradas automaticamente a partir dessa lista.

### Tópicos (`data/topics/<pasta>/<id>.json`)

- **`title`** e **`levels`** (sempre 4, nesta ordem: Fundamentos, Básico,
  Intermediário, Pleno).
- **`project`** (opcional): banner de contexto TechCommerce no topo. Tem `title`,
  `description`, `note` e um destes: `tables` (`[{name, columns, rows}]`), `code`
  (`{label, content}`) ou `terminal` (`{shell, lines, output}`). Pode ter
  `playground` e `seedSql` (ver abaixo).
- **`refTables`** (opcional): tabelas de referência `[{name, columns, rows}]`. Cada
  questão mostra só as tabelas que cita (pelo nome da tabela ou de uma coluna
  exclusiva dela); a questão pode fixar a lista com `tables: ["pedidos", ...]` ou
  esconder com `tables: []`.
- **`playground`** liga o painel "Rodar query":
  - `playground: true` no topo do JSON, ou `project.playground: true`/`"sqlite"`:
    SQLite (sql.js) criado a partir de `project.tables` ou, sem ela, de `refTables`;
  - `project.playground: "postgres"`: PostgreSQL (PGlite) criado com `project.seedSql`.
  - Cada execução recomeça com os dados originais.
- **`finalProject`**: tarefa aberta liberada após os 4 níveis,
  `{ title, area, ask, task, deliverables[] }`. As entregas viram checkboxes salvos no
  progresso.

Cada nível tem:

- `name`;
- `keyConcepts` (o que aparece antes das questões): lista de
  `{ term, situation, code, howItWorks, whenToUse, whenToAvoid, altCode, note }`,
  todos opcionais menos `term`;
- `explain` (opcional): texto introdutório, mostrado junto com os links;
- `links`: no máximo 4, `[{label, url}]`, com o tipo entre colchetes no começo do
  `label` (`[doc]`, `[livro]`, `[artigo]`, `[vídeo]`);
- `questions`.

### Tipos de questão

| type | campos-chave | como é corrigida |
|---|---|---|
| `mc` | `options` (4), `correct` (índice original) | comparação do índice; a tela embaralha a ordem e guarda o índice original |
| `fill` | `accept` (respostas aceitas) | minúsculas, sem acento, sem `().`, hífen e sublinhado viram espaço, espaços colapsados; também compara sem espaços |
| `code` | `requiredGroups` (grupos de termos), `sample`, `schemaHint` opcional | acerta se cada grupo tem ao menos 1 termo no texto (maiúsculas, sem acento, espaços e quebras colapsados); termos de até 3 caracteres só valem como palavra inteira |
| `terminal` | como `code`, mais `shell` e `output` | igual a `code`; o campo é de uma linha e o feedback mostra a saída simulada |

Regras da correção:

- Toda questão tem `id` fixo no formato `<topico>-n<nivel>q<posição>` (o histórico usa
  esse id, então inserir ou reordenar questões não bagunça o progresso) e `explain`.
- Resposta em branco não conta como tentativa nem como erro.
- Em `code`/`terminal`, colar o enunciado ou a dica (`schemaHint`) não vale como
  resposta.
- Em `code`/`terminal`, depois de ver o gabarito o aluno pode marcar a própria
  resposta como equivalente ("marcar como entendida"). A marcação vale só para o
  texto comparado; se ele mudar a resposta, a correção automática volta a valer.
- Ao escrever questões `code`/`terminal`, dê alternativas válidas em cada grupo e não
  exija nomes que o enunciado não fornece. O `sample` precisa passar na própria
  correção.
- Textos aceitam `<code>`, `<strong>` e `<em>`; qualquer outro `<...>` (como `<nome>`)
  aparece como texto.

## Como adicionar conteúdo

### Novo sub-tópico em capítulo existente

1. Crie `data/topics/<pasta>/<novo-id>.json` (copie um vizinho como modelo) com ids
   de questão no padrão `<novo-id>-n<nivel>q<posição>`.
2. Adicione `{ "id": "<novo-id>", "file": "<pasta>/<novo-id>.json" }` em
   `data/topics-manifest.json`.
3. Adicione `{ "topicId": "<novo-id>", "slug": "<slug>", "sub": "..." }` na lista
   `subtopics` (ou no `groups[].subtopics` certo) do capítulo em `data/chapters.json`.
4. Rode as checagens de `tests/`, suba o servidor local e confira o tópico.

### Capítulo novo

1. Crie `data/topics/<novo-capitulo>/` com os JSONs dos tópicos e registre todos no
   `topics-manifest.json`.
2. Adicione a chave do capítulo em `chapters.json` (com `subtopics` ou `groups` e
   `book`) na **posição pedagógica certa**: a ordem das chaves é a ordem de estudo.
3. Se quiser que ele apareça em "Requisitos" na home, inclua-o em
   `CAREER_REQUIREMENTS` no `js/app.js`; para a página Recursos, adicione um filtro e
   cards em `resources.json`.

Depois de qualquer mudança em `data/`, `css/`, `js/` ou `index.html`, rode
`node build.js` para atualizar o `dist/`.

## Gerar o arquivo único (build.js)

```bash
node build.js                    # -> dist/trilha-engenharia-dados.html
node build.js caminho/custom.html
```

`build.js` (Node, só `fs`/`path`, zero dependências) lê `index.html`, `css/app.css`,
`js/grader.js`, `js/app.js` e `data/`, põe os dados inline no lugar dos `fetch()` e
gera um HTML único que roda abrindo o arquivo direto, sem servidor. Aberto como
arquivo, ele funciona sem login (progresso só no navegador); publicado em `http(s)`,
o login volta a aparecer.

## Testes

Em `tests/` (detalhes em `tests/README.md`):

```bash
cd tests
npm run check:content          # sem dependências: correção, estrutura e viés das múltipla escolha
npm install && npm run check   # tudo, inclusive executar os exercícios do playground SQL
```

Ao editar conteúdo: rode `npm run check:content` (ou `npm run check` se o tópico tem
playground), confira no navegador que o tópico carrega e pontua, e rode
`node build.js`.
