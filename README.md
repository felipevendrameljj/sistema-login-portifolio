# VD-Finanças

Sistema de controle financeiro pessoal/comercial para registrar entradas,
saídas e cobranças. Usa Firebase Authentication para contas, Cloud Firestore
para os lançamentos e uma Cloud Function para confirmar cobranças pagas por
e-mail.

## Funcionalidades

- Cadastro, login, verificação de e-mail e recuperação de senha.
- Lançamentos de entrada e saída, com categoria, data e informações adicionais.
- Cobranças com devedor, e-mail, vencimento, situação e data de pagamento.
- Indicadores mensais de entradas, saídas, saldo e cobranças em aberto.
- Busca e filtros por tipo e situação; edição, exclusão e registro de pagamento.
- Confirmação automática ao devedor quando uma cobrança é marcada como paga;
  status do envio visível e opção de reenvio em caso de falha.
- Regras do Firestore que validam os dados, restringem acesso ao proprietário
  com e-mail verificado e impedem a alteração pelo navegador dos estados de
  envio de e-mail.
- Política de Privacidade LGPD, Termos de Uso e exclusão de conta com
  reautenticação e remoção dos registros associados.
- Área administrativa com claim personalizada, TOTP obrigatório e funções de
  servidor para consultar e gerenciar lançamentos de todas as contas.

## Modelo de dados

- `users/{uid}`: nome, e-mail e data de criação.
- `transactions/{id}`: proprietário, tipo, descrição, categoria, valor em
  centavos, data, vencimento, pagamento, status, dados da outra parte, notas e
  estado da confirmação por e-mail. Os campos de envio são escritos somente
  pela Cloud Function.

## Configuração do Firebase

O projeto referenciado é `sistemadelogin-01`, definido em
[`FirebaseConfig/Index.js`](./FirebaseConfig/Index.js) e [`.firebaserc`](./.firebaserc).
Sua conta precisa ter acesso ao projeto no Firebase Console.

1. Em **Authentication > Sign-in method**, habilite **E-mail/senha**.
2. Em **Authentication > Settings > Authorized domains**, autorize
   `localhost` para desenvolvimento e o domínio publicado do Firebase Hosting.
3. Em **Authentication > Templates**, configure o remetente e os modelos de
   verificação de e-mail e redefinição de senha.
4. Configure SMTP para o remetente que enviará confirmações aos devedores. Não
   coloque usuário, senha ou tokens SMTP no frontend ou em arquivos versionados.
5. A implantação de Cloud Functions exige o plano Firebase Blaze e faturamento
   configurado. O provedor SMTP pode ter custos e limites próprios.
6. Restrinja a chave pública do Firebase às APIs e domínios necessários no
   Google Cloud Console. A chave usada no frontend identifica o projeto; não é
   uma senha. A proteção dos dados depende principalmente das regras do
   Firestore, da autenticação e da configuração correta do projeto.

Instale Node.js 22, npm e Firebase CLI. Na raiz do projeto, autentique-se e
cadastre os dados SMTP como secrets; cada comando solicita o valor
interativamente:

```powershell
npm install --global firebase-tools
firebase login
firebase functions:secrets:set SMTP_HOST
firebase functions:secrets:set SMTP_PORT
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASSWORD
firebase functions:secrets:set SMTP_FROM
firebase deploy --only firestore:rules,functions,hosting
```

`SMTP_PORT` deve ser `465` para TLS ou `587` para STARTTLS. Use em `SMTP_FROM`
um endereço autorizado pelo provedor. A Function `notifyPaidCharge` envia a
confirmação quando a cobrança passa para paga; `retryPaymentConfirmation`
permite reenviar com autenticação. Após a publicação, consulte os logs das
Functions e teste a entrega real com uma cobrança de teste.

## Acesso administrativo e MFA

A rota `Admin/Index.html` não concede acesso por ser conhecida ou estar
publicada. O servidor só aceita operações administrativas quando a sessão tem
claim `admin`, e-mail verificado, MFA TOTP concluído e autenticação recente
(últimos cinco minutos). A área pode ler e criar, editar ou excluir lançamentos
de qualquer conta; não pode excluir contas de usuários. O acesso administrativo
usa Cloud Functions e não amplia as regras de leitura direta do Firestore.

1. No Firebase Console, atualize o projeto para **Firebase Authentication with
   Identity Platform** e habilite **TOTP** como segundo fator. TOTP requer
   Identity Platform.
2. Crie ou confirme a conta administrativa, verifique o e-mail e use uma senha
   exclusiva e forte. A senha nunca deve ser colocada neste repositório, em
   variáveis versionadas ou enviada por mensagem.
3. Instale as dependências locais da Function e autentique o Google Cloud SDK
   com uma conta que tenha permissão administrativa de Firebase Authentication:

   ```powershell
   npm install --prefix .\functions
   gcloud auth application-default login
   $env:VD_ADMIN_EMAIL = '<e-mail da conta verificada>'
   node .\functions\scripts\manage-admin-claim.js grant
   Remove-Item Env:\VD_ADMIN_EMAIL
   ```

4. Publique as Functions. Encerre as sessões abertas, abra **Acesso do
   administrador**, entre com a conta e cadastre a chave TOTP em um aplicativo
   autenticador. Após confirmar o primeiro código, entre novamente e valide o
   segundo fator para abrir o painel.

O script `manage-admin-claim.js` não é enviado no pacote de Functions. Para
revogar o acesso, use a ação `revoke`; se o autenticador for perdido, a ação
`reset-mfa` remove os fatores para permitir novo cadastro após login com senha:

```powershell
$env:VD_ADMIN_EMAIL = '<e-mail da conta administrativa>'
node .\functions\scripts\manage-admin-claim.js revoke
# ou, para recuperar um autenticador perdido:
node .\functions\scripts\manage-admin-claim.js reset-mfa
Remove-Item Env:\VD_ADMIN_EMAIL
```

Proteja também o acesso ao Google Cloud/Firebase Console e a credencial ADC usada
para administrar claims: quem controla essa credencial pode conceder ou revogar
administradores. As operações de leitura e alteração administrativa geram
registros de auditoria no Cloud Logging, sem gravar os valores financeiros
nesses registros.

## Privacidade, exclusão e titularidade

A Política de Privacidade e os Termos de Uso ficam disponíveis em
[`Legal/Index.html`](./Legal/Index.html), inclusive na tela de acesso e no
rodapé do painel. A exclusão da conta exige senha recente e remove os registros
associados da conta no Firebase; publique a Function `deleteMyAccount` junto
com as demais para habilitar o fluxo.

O arquivo [`LICENSE`](./LICENSE) declara a licença proprietária e reserva os
direitos de uso. Esse aviso não altera a visibilidade do repositório no GitHub;
um repositório público continua publicamente visível. Componentes de terceiros
mantêm as respectivas licenças.

## Executar localmente

Os módulos usam ES Modules e precisam ser servidos por HTTP. Não abra os HTML
diretamente como `file://`.

1. Abra a pasta raiz no VS Code.
2. Pressione **F5** e escolha **Run VD-Finanças**. A tarefa inicia um servidor
   local em `http://localhost:8080/`.
3. Alternativamente, execute:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\.vscode\serve.ps1
   ```

É necessário habilitar E-mail/senha, Firestore, publicar as regras e implantar a
Cloud Function com os secrets SMTP para testar o fluxo real de pagamentos e
confirmações.
