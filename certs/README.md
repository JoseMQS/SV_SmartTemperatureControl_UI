# Certificado TLS do broker (EMQX Cloud)

Coloca aqui o ficheiro `emqxsl-ca.crt` que o teu flow do Node-RED já usava
(nó "emqx_brokie", campo TLS). Este ficheiro é público — é só a "Autoridade
Certificadora" que garante que estás mesmo a falar com o teu broker EMQX e
não com um impostor. Não é uma senha, por isso é seguro fazer commit dele.

## Onde obter

1. Entra no painel da [EMQX Cloud](https://cloud.emqx.com)
2. Abre a tua instância (a mesma do `xf7518f8.ala.eu-central-1.emqxsl.com`)
3. Vai a **Overview** → secção de ligação TLS/SSL → **Download Certificate**
4. Guarda o ficheiro aqui como `certs/emqxsl-ca.crt`

O `.env` já aponta para `BROKER_CA_PATH=./certs/emqxsl-ca.crt` por omissão.

## Não tenho a certeza se preciso disto

Experimenta primeiro sem o certificado (deixa `BROKER_CA_PATH` vazio no `.env`).
Muitos brokers EMQX Cloud usam certificados assinados por uma autoridade
pública reconhecida (tipo Let's Encrypt), e nesse caso o Node.js já confia
neles sem precisares deste ficheiro.

Só precisas mesmo do `emqxsl-ca.crt` se, ao correr `npm start`, vires um erro
do tipo `unable to verify the first certificate` ou `self signed certificate`
nos logs — isso é o Node.js a dizer que não reconhece quem assinou o
certificado do broker.
