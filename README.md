# Controle de Gastos

Aplicação estática que usa Firebase Authentication para login e Cloud Firestore
para armazenar os perfis e os gastos de cada usuário. O projeto Firebase já
referenciado pelo app é `gastos-a2c8e`. O Firebase oferece o plano Spark sem
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
   projeto `gastos-a2c8e`. Se não tiver acesso a ele, peça ao proprietário para
   adicionar sua conta; criar outro projeto exige atualizar também a
   configuração em `FirebaseConfig/Index.js`.
2. Em **Firestore Database**, crie o banco de dados. Escolha uma região próxima
   dos usuários (por exemplo, `southamerica-east1`) e o modo de produção. A
   região do Firestore não pode ser alterada depois da criação.
3. Em **Authentication > Sign-in method**, habilite **Email/Password**.
   Habilite Google, GitHub ou Facebook somente se for configurar as respectivas
   credenciais/provedores no Console.
4. Em **Authentication > Settings > Authorized domains**, confirme que
   `localhost` está autorizado para desenvolvimento local.
5. Publique as regras abaixo. Isso requer uma conta com permissão no projeto:

   ```powershell
   npm install --global firebase-tools
   firebase login
   firebase deploy --only firestore:rules
   ```

   Execute os comandos na pasta raiz do projeto. O `.firebaserc` seleciona
   `gastos-a2c8e` automaticamente. A publicação das regras não apaga os dados.

## Executar localmente

Os módulos JavaScript usam imports ES Modules e precisam ser servidos por HTTP;
não abra o HTML diretamente como `file://`.

1. Instale o Node.js LTS, que inclui `npm`.
2. Na pasta raiz, execute:

   ```powershell
   npx http-server . -p 8080
   ```

3. Abra `http://localhost:8080/` no navegador. O endereço redireciona para a
   tela de login em `.vscode/HTML/Index.html`.

Depois de ativar o Firestore e publicar as regras, crie uma conta para verificar
o fluxo completo. As cotas gratuitas do Spark são limitadas e podem mudar;
consulte a página de preços do Firebase antes de usar em produção.
