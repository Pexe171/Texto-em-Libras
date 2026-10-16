# Texto em Libras

Aplicativo local para escrever em português e acompanhar a tradução automática em um avatar 3D. O projeto organiza a entrada do texto, a revisão por trechos e os controles de reprodução. A tradução e a animação são fornecidas pelo VLibras.

## O que dá para fazer

- Traduzir textos de até 5.000 caracteres.
- Dividir textos longos em trechos menores, com prévia antes do envio.
- Conferir o texto de cada trecho junto da sequência de sinais retornada.
- Sinalizar um trecho individualmente ou reproduzir a sequência completa.
- Pausar, continuar, repetir, parar e ajustar a velocidade.
- Escolher entre os avatares Ícaro, Hosana e Guga.
- Cancelar uma tradução ou retomar os trechos pendentes após uma falha.
- Editar o português de um trecho e traduzir novamente somente aquela parte.
- Salvar uma sessão neste navegador mediante opção e restaurar depois, sem envio automático.
- Reutilizar as últimas oito frases pelo histórico do navegador.

É um protótipo para experimentar a integração com o VLibras. Não possui um motor próprio de tradução, não funciona offline e não adapta os movimentos para personagens personalizados.

## Requisitos

| Para usar | Requisito |
| --- | --- |
| Servidor local | Python 3.10 ou superior |
| Interface | Navegador atualizado com WebGL |
| Tradução, avatar e sinais | Acesso à internet |
| Testes de JavaScript | Node.js 20 ou superior |
| Testes de navegador, opcionais | Chrome e a dependência de desenvolvimento `playwright-core` |

Não é necessário instalar pacotes Python, configurar banco de dados ou fornecer uma chave de API. Node.js não é necessário para abrir e usar o aplicativo.

## Baixar e executar

```sh
 git clone https://github.com/Pexe171/Texto-em-Libras.git
 cd Texto-em-Libras
```

No Windows, abra **INICIAR LIBRAS.cmd** com dois cliques. O atalho inicia o servidor e abre o navegador.

Também é possível iniciar pelo terminal, a partir da pasta do projeto:

```sh
python aplicativo/servidor.py
```

No Linux ou macOS, use `python3` se esse for o nome do comando instalado.

O endereço padrão é **http://127.0.0.1:8765**. Mantenha o terminal aberto enquanto estiver usando a página. Para encerrar, pressione `Ctrl+C`.

Para escolher outra porta ou iniciar sem abrir o navegador:

```sh
python aplicativo/servidor.py --port 8766 --no-browser
```

## Como usar

1. Escreva ou cole o texto em português. A tradução funciona mesmo se o avatar estiver carregando ou indisponível.
2. O estado do avatar e o estado da tradução aparecem separadamente.
3. Para textos longos, mantenha **Traduzir em trechos menores** ativado e use **Ver trechos antes de traduzir** para conferir a divisão.
4. Clique em **Traduzir texto**, ou pressione `Ctrl+Enter`. O resultado fica pronto para revisão, sem iniciar a animação.
5. Compare o original, o português editável e a glosa de cada trecho. Ao reformular um trecho, sua tradução antiga é invalidada; use **Traduzir este trecho** para atualizar somente aquela parte.
6. Quando o avatar estiver pronto, clique em **Reproduzir** para a sequência completa ou **Sinalizar trecho** para uma parte concluída. Isso também funciona durante a tradução de outras partes.

Se uma tradução parar no meio, **Retomar trechos pendentes** continua a partir dos trechos ainda não traduzidos. **Tentar este trecho novamente** repete somente a parte escolhida. Os concluídos são preservados na página. Alterar um trecho não descarta os demais. Alterar o texto principal e gerar outra divisão exige confirmar o descarte quando já houver traduções ou edições.

**Salvar esta sessão neste navegador** começa desativado. Ao ativar, um rascunho com texto, edições e traduções concluídas é atualizado localmente. Na próxima abertura, escolha **Restaurar sessão** ou **Descartar sessão salva**. Restaurar não envia textos ao tradutor nem inicia reprodução. **Apagar sessão salva** remove o rascunho e desativa o salvamento; o histórico tem um controle separado. Se o armazenamento falhar, a sessão continua em memória com um aviso.

O exemplo sobre mudanças na vida é uma versão editorial em frases mais diretas. Ele pode ser carregado, lido e editado antes da tradução. Não é uma tradução em Libras previamente validada.

## Blueprint: como funciona

```mermaid
flowchart TD
    Usuario[Pessoa escreve em português] --> Interface[Interface no navegador]
    Interface --> Divisao{Dividir em trechos?}
    Divisao -->|Sim| Trechos[Separar frases e limitar trechos]
    Divisao -->|Não| Inteiro[Manter o texto inteiro]
    Trechos --> Fila[Fila de tradução no navegador]
    Inteiro --> Fila

    subgraph Local[Computador local]
        Fila -->|POST /api/translate| Servidor[Servidor Python em 127.0.0.1]
        Servidor --> Validacao[Validar formato e tamanho]
        Validacao --> Cache{Tradução no cache?}
        Cache -->|Sim| Resposta[Resposta JSON com a glosa]
        Retorno[Resposta do tradutor] --> CacheMemoria[Guardar resultado em memória]
        CacheMemoria --> Resposta
    end

    Cache -->|Não| Tradutor[Serviço externo de tradução VLibras]
    Tradutor --> Retorno
    Resposta --> Revisao[Texto original e glosa lado a lado]
    Revisao --> Escolha[Pessoa revisa e clica em Reproduzir]
    Escolha -->|postMessage| Player[Player oficial VLibras em iframe]
    Player --> Acervo[Carregar avatar e sinais do VLibras]
    Acervo --> Animacao[Avatar sinaliza no navegador]
    Player -->|Eventos de progresso e reprodução| Interface
    Interface --> Historico[Histórico no localStorage do navegador]
    Revisao --> Opcao{Salvar sessão ativado?}
    Opcao -->|Sim| Rascunho[Rascunho local com texto e traduções]
    Rascunho --> Restaurar[Oferecer restauração na próxima abertura]
    Restaurar --> Revisao
```

### Do texto ao movimento

**1. Preparação do texto.** A interface aceita até 5.000 caracteres. Com a divisão ativada, `text-utils.js` separa frases por pontuação ou quebra de linha. Trechos maiores são divididos preferencialmente nas vírgulas e, quando necessário, entre palavras, buscando um limite de 220 caracteres. O código não substitui palavras nem corrige o sentido do texto.

**2. Tradução em fila.** `session.js` mantém os trechos e envia um por vez ao servidor local. A página mostra o progresso e permite interromper a fila. Se houver uma falha, os trechos concluídos continuam disponíveis para revisão e reprodução individual. Uma execução cancelada recebe um identificador inválido, para que respostas atrasadas não sobrescrevam uma execução nova. A fila funciona independentemente do carregamento do avatar.

**3. Comunicação com o VLibras.** `servidor.py` valida o pedido e consulta o serviço de tradução. O resultado é uma **glosa**: uma representação textual da sequência que será interpretada pelo player. Ela não precisa ter a mesma ordem ou a mesma forma de uma frase em português.

**4. Reprodução.** Depois de um clique em **Reproduzir** ou **Sinalizar trecho**, `player.js` envia a glosa ao player oficial por `postMessage`. O player carrega os recursos dos servidores VLibras e controla a animação. Os controles de pausa, velocidade, avatar e repetição usam esse mesmo canal. As mensagens recebidas pela página são verificadas pela origem e pela janela do iframe. Eventos de inatividade são mostrados como espera, sem afirmar que todos os sinais foram reproduzidos. Parar a animação aparece como reprodução interrompida.

### O que roda onde

| Componente | Responsabilidade |
| --- | --- |
| Interface local | Texto, divisão, fila, revisão, histórico e controles |
| Servidor Python local | Validação, chamada ao tradutor, tentativas e cache |
| Serviço de tradução VLibras | Converter o português para a sequência de sinais |
| Player e acervo VLibras | Carregar os recursos e animar o avatar |

O servidor atende somente em `127.0.0.1`; ele não publica o aplicativo na rede. A pasta servida é `aplicativo/public`, não a raiz do projeto.

### API local

| Método | Endereço | Resultado |
| --- | --- | --- |
| `GET` | `/` | Interface do aplicativo |
| `GET` | `/api/health` | Estado do servidor local; não testa os serviços externos |
| `POST` | `/api/translate` | Tradução de um texto em uma glosa |

Exemplo de requisição:

```http
POST /api/translate
Content-Type: application/json

{"text":"Olá, tudo bem?"}
```

Exemplo de resposta:

```json
{"gloss":"OI TUDO_BEM [INTERROGAÇÃO]"}
```

O conteúdo traduzido depende da resposta do VLibras e pode mudar. Pedidos inválidos recebem `400`; origem externa informada no pedido é rejeitada com `403`; formato diferente de JSON recebe `415`. Falhas do serviço de tradução são apresentadas ao navegador como `502`, acompanhadas de uma mensagem sobre a causa.

As respostas de erro preservam `error` e incluem `code` e `retryable`. Quando existe um status HTTP externo, também incluem `upstream_status`:

```json
{"error":"O serviço VLibras está indisponível.","code":"UPSTREAM_ERROR","retryable":true,"upstream_status":500}
```

Os códigos do tradutor são `TIMEOUT`, `CONNECTION_ERROR`, `RATE_LIMIT`, `UPSTREAM_ERROR` e `INVALID_RESPONSE`. Erros de pedido usam `INVALID_REQUEST`, `FORBIDDEN_ORIGIN`, `UNSUPPORTED_MEDIA_TYPE` ou `NOT_FOUND`. A mensagem é para leitura; a classificação é feita pelos campos, sem interpretar o texto.

### Tentativas, cache e armazenamento

O servidor faz até três tentativas para erros temporários, como falhas de conexão, respostas HTTP 408, 429 e 5xx. Cada tentativa de conexão usa um timeout de oito segundos. Entre tentativas, há uma pequena espera. A interface limita a espera de cada trecho a 35 segundos.

Até 128 traduções bem-sucedidas ficam em um cache em memória. Erros não entram no cache. Ele é compartilhado pelas requisições daquele processo e desaparece quando o servidor é encerrado.

O histórico guarda até oito textos no `localStorage` do navegador. Pode ser apagado pela própria interface. O servidor não salva as frases em arquivos, mas os textos são enviados ao serviço externo para tradução. O navegador também carrega o player, os sinais e fontes externas.

O rascunho opcional usa a chave versionada `texto-em-libras-session-v1`, separada do histórico. A restauração valida limites e formato; sessões incompatíveis ou corrompidas não impedem o uso do aplicativo. Não há banco de dados ou sincronização do rascunho entre dispositivos.

Cancelar interrompe a fila no navegador. Uma requisição já recebida pelo servidor pode terminar em segundo plano.

## Estrutura do repositório

```text
Texto-em-Libras/
├── .gitignore
├── INICIAR LIBRAS.cmd
├── README.md
└── aplicativo/
    ├── servidor.py
    ├── public/
    │   ├── index.html
    │   ├── style.css
    │   ├── app.js
    │   ├── session.js
    │   ├── player.js
    │   ├── text-utils.js
    │   └── texto-vida.txt
    └── qa/
        ├── package.json
        ├── package-lock.json
        ├── test_servidor.py
        ├── test-text.cjs
        ├── test-session.cjs
        ├── test-player.cjs
        ├── verificar.cjs
        └── verificar-texto-longo.cjs
```

Modelos Blender, downloads de pesquisa, cópias do código do VLibras, caches e `node_modules` não fazem parte da distribuição. Eles não são necessários para executar esta versão.

## Testes

### Verificações locais

Na raiz do projeto:

```sh
python aplicativo/qa/test_servidor.py
node aplicativo/qa/test-text.cjs
node aplicativo/qa/test-session.cjs
node aplicativo/qa/test-player.cjs
node --check aplicativo/public/app.js
```

Os testes Python verificam tentativas após falha, cache, classificação de erros, rejeição de respostas inválidas e cancelamento de conexões. Os testes JavaScript cobrem divisão, retomada, edição isolada, restauração, mensagens do player e respostas tardias após cancelamento. Essas verificações não precisam acessar o VLibras. O GitHub Actions as executa em Python 3.10 e 3.14, com Node.js 20, em cada push e pull request.

### Verificações no navegador

Instale a dependência de teste:

```sh
npm ci --prefix aplicativo/qa
```

O Chrome deve estar instalado. Por padrão, os scripts procuram o executável em `C:/Program Files/Google/Chrome/Application/chrome.exe`. Para outro caminho, defina `BROWSER_PATH`. Exemplo no PowerShell:

```powershell
$env:BROWSER_PATH = 'C:\caminho\para\chrome.exe'
```

Com o servidor na porta **8765**, execute:

```sh
node aplicativo/qa/verificar.cjs
```

Esse teste consulta o tradutor real, carrega o avatar e verifica a integração, os controles, o histórico e o layout de celular. Ele pode falhar se o VLibras estiver indisponível.

Para o teste de textos longos, inicie outro servidor na porta **8766**:

```sh
python aplicativo/servidor.py --port 8766 --no-browser
```

Em outro terminal:

```sh
node aplicativo/qa/verificar-texto-longo.cjs
```

Esse teste simula tanto o tradutor quanto o player para verificar a fila, falha parcial, edição, retomada, cancelamento, respostas tardias, revisão sem reprodução automática e armazenamento. Funciona sem depender dos serviços VLibras. Não é um teste de qualidade linguística. Capturas e relatórios gerados são ignorados pelo Git.

Use `BASE_URL` para testar um servidor em outro endereço local. Para testar o serviço real na porta 8766, por exemplo, no PowerShell:

```powershell
$env:BASE_URL = 'http://127.0.0.1:8766'
node aplicativo/qa/verificar.cjs
```

## Problemas comuns

| Situação | O que fazer |
| --- | --- |
| `python` não é reconhecido | Instale Python 3.10+ e confira se o comando está disponível no terminal. |
| A porta 8765 está ocupada | Encerre a instância anterior ou use `--port 8766`. |
| O avatar demora ou não carrega | Confira a conexão, o suporte a WebGL e tente carregar novamente pela página. |
| O terminal mostra `POST /api/translate ... 502` | Veja a mensagem da interface. O serviço externo pode ter retornado erro, excedido o tempo de resposta ou ficado inacessível. Use a retomada se houver trechos concluídos. |
| A glosa omite palavras ou escolhe um sentido errado | Revise o trecho em português, experimente uma frase mais direta e confira o resultado com alguém fluente em Libras. Repetir a mesma chamada não garante uma correção. |
| Uma atualização não aparece | Reinicie o servidor após mudanças no Python e use `Ctrl+F5` no navegador para atualizar a interface. |

## Limitações

A integração técnica não garante uma tradução linguisticamente correta. Nos testes, o serviço externo apresentou omissões e escolhas inadequadas de sentido, principalmente em textos abstratos. Dividir o texto pode facilitar a revisão, mas também pode retirar contexto. O modo de divisão pode ser desativado para comparar os resultados.

O projeto não inclui uma revisão linguística automática, um acervo próprio de animações ou um mecanismo para treinar avatares. Também não substitui um intérprete de Libras. Mudanças nos serviços ou no protocolo do player podem exigir ajustes no código.
