# Controle de Gastos

Aplicação estática que usa Firebase Authentication para login e Cloud Firestore
para armazenar os perfis e os gastos de cada usuário. O projeto Firebase já
referenciado pelo app é `sistemadelogin-01`. O Firebase oferece o plano Spark sem
custo com cotas limitadas; confirme no Console qual plano está ativo nesse
projeto e consulte as cotas vigentes antes de usar.

## Estrutura do banco

- `users/{uid}`: nome, email e datas de criação/último acesso do usuário.
- `expenses/{id}`: `uid`, categoria, descrição, valor e data do gasto.
- As regras em [`firestore.rules`](./firestore.rules) restringem leitura e
  exclusão ao dono dos dados e validam os campos gravados.
- [`firebase.json`](./firebase.json) aponta para as regras; [`.firebaserc`](./.firebaserc)
  seleciona o projeto já configurado em `FirebaseConfig/Index.js`.

## Ativação do Firebase (uma vez por projeto)

1. Abra [Firebase Console](https://console.firebase.google.com/) e selecione o
   projeto `sistemadelogin-01`. Se não tiver acesso a ele, peça ao proprietário para
   adicionar sua conta; criar outro projeto exige atualizar também a
   configuração em `FirebaseConfig/Index.js`.
2. O projeto já possui o banco `(default)` do Firestore, na região `nam5`.
   Não crie outro banco nem tente alterar sua região; essa configuração é
   permanente.
3. Em **Authentication > Método de login**, habilite **E-mail/senha**. Esse
   provedor ainda não está habilitado no projeto. Habilite Google, GitHub ou
   Facebook somente se configurar as respectivas credenciais/provedores no Console.
4. Em **Authentication > Settings > Authorized domains**, confirme que
   `localhost` está autorizado para desenvolvimento local.
5. Publique as regras do banco e o site. Isso requer uma conta com permissão
   no projeto:

   ```powershell
   npm install --global firebase-tools
   firebase login
   firebase deploy --only firestore:rules,hosting
   ```

   Execute os comandos na pasta raiz do projeto. O `.firebaserc` seleciona
   `sistemadelogin-01` automaticamente. A publicação das regras não apaga os dados.
   Após a publicação, o Firebase Hosting informa os endereços públicos
   `https://sistemadelogin-01.web.app` e `https://sistemadelogin-01.firebaseapp.com`.

## Executar pelo VS Code

Os módulos JavaScript usam imports ES Modules e precisam ser servidos por HTTP;
não abra o HTML diretamente como `file://`.

1. Abra a pasta raiz do projeto no VS Code.
2. Pressione **F5** e escolha **Run Controle de Gastos**. A tarefa inicia um
   servidor local com PowerShell e abre `http://localhost:8080/` no Chrome.
3. Para iniciar o servidor manualmente, execute na raiz do projeto:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\.vscode\serve.ps1
   ```

   Em seguida, acesse `http://localhost:8080/`.

Depois de ativar o Firestore e publicar as regras, crie uma conta para verificar
o fluxo completo. As cotas gratuitas do Spark são limitadas e podem mudar;
consulte a página de preços do Firebase antes de usar em produção.
