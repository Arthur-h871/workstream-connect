

# RESOLVIDOS

## 02 - EXIBIÇÃO DO NOME DO USUARIO
*CONTEXTO*
na sidebar onde são exibidas as abas do sistema, existe uma sessão que mostra o perfil do usuario
ali é exibido o nome completo dele

*PROBLEMA*
caso o nome do usuario seja maior horizontalmente que a largura da sidebar, o nome é exibido saindo para fora do espaço dele

*COMO RESOLVER*
faça a exibição ser apenas do primeiro nome do usuario, e caso esse nome sozinho consiga exceder o espaço, faça com que ele tenha parte oculta pelo limite da largura da sidebar

## 01 - EXIBIÇÃO DE ABA ABERTA NA SIDEBAR
*CONTEXTO*
na sidebar do sistema, a aba aberta é exibida com cor laranja, indicando qual aba esta aberta

*PROBLEMA*
quando o usuario abre a aba "tarefas da org", duas abas ficam laranja, e não somente uma:
"tarefas da org" e "minhas tarefas"

*COMO RESOLVER*
corrija o problema para que seja exibido em laranja apenas a aba selecionada

## 03 - CORRELAÇÃO DE MARCAÇÃO DE TAREFAS
*CONTEXTO*
nos apontamentos, ao adicionar uma tarefa vinculada é possivel marcar como concluida(sem marcação = iniciada nesse apontamento. com marcação = finalizada nesse apontamento)

*PROBLEMA*
a tarefa pode ser marcada como concluida no apontamento e continuar sem marcaçã de concluida em sua origem(seja tarefas da org ou pessoais)

*COMO RESOLVER*
adicione uma ligação entre marcar como concluida no apontamento e a definição de concluida nas origens

tarefas tem um campo que diz o status delas(na fila, em progresso ou concluida)
faça com que, ao adicionar uma tarefa relacionada nos apontamentos, a tarefa seja marcada como em progresso ou concluida, dependendo se ela foi marcada como concluida ou nao na ligação do apontamento



## 04 - DESENHOS FIXOS NA TELA NO CANVAS
*CONTEXTO*
na pagina de notas(canvas) existe uma função que permite o usuario desenhar livremente na tela

*PROBLEMA*
quando o usuario muda o zoom ou anda pelo canvas, o desenho fica fixo na tela dele, e não fixo em sua posição original no canvas

*COMO RESOLVER*
todos os elementos do canvas devem salvar suas coordenadas x e y, o site deve renderizar tudo em suas devidas coordenadas


## 05 - ADICIONAR NOVA NOTA
*CONTEXTO*
na pagina de canvas existem 2 botões para adicionar novas notas
o primeiro deles fica no topo da tela com o texto "+ nova nota"
o segundo fica no fundo da tela com um icone de lapis

*PROBLEMA*
o segundo botão abre um modal que permite o usuario digitar sua nota, mas o botão de salvar nota não adiciona a nota ao canvas

*COMO RESOLVER*
remova completamente o segundo botão

## 06 - POP UP DE NOTAS
*CONTEXTO*
foi documentado na criação do sistema uma feature que permite o usuario abrir uma nova janela em sua maquina, permitindo editar notas indiretamente, sem precisar fazer isso diretamente no site

*PROBLEMA*
a feature não foi implementada

*COMO RESOLVER*
implemente a função "abrir pop-up de edição"
todos os quadros do canvas(notas, to-do lists, etc) devem ter um botão(sem texto, apenas icone) de abrir pop up de edição

esse pop up deve ter o seguinte design:
header com nome da nota e configs a esquerda, botão de fechar a direita
ao lado do botão de fechar nota, uma bolinha que indica se a nota teve alterações(bolinha vazia = sem alterações, bolinha cheia = alterações não salvas)
e a sessão principal do arquivo fica com o texto da nota ou os itens da to-do list
o design da nota segue o estilo bloco de notas padrão de sistemas operacionais como linux pop_os!

## 07 - DESENHOS LIVRES PERMANENTES
*CONTEXTO*
na pagina de canvas existe uma função de desenho livre, que permite o usuario desenhar na sua tela

*PROBLEMA*
não existe nenhuma forma de apagar esses desenhos

*COMO RESOLVER*
adicione 2 formas de apagar desenhos:
    selecionar o desenho e apagar(se aplicavel. o sistema pode usar uma forma incompativel de salvar desenhos livres):
        essa forma consiste em selecionar o objeto do desenho e adicionar um botão de excluir na seleção
        essa função de selecionar o desenho tambem pode servir para redimencionar e mover

    ferramenta de borracha:
        função parecida com o lapis, porem com intuito de apagar os desenhos
        icone de ativação fica ao lado do icone do desenho livre

## 08 - FUNÇÃO POP UP DE TAREFAS
*CONTEXTO*
foi adicionado recentemente a função de criar um pop up editavel para os quadros (erro resolvido 06 - POP UP DE NOVA NOTA)
permitindo o usuario edtiar as informações dos quadros sem ir ate a tela do site

*PROBLEMA*
essa função apenas adiciona um modal na tela, não sendo possivel mudar sua posição e nem acessa-lo fora do site

*COMO RESOLVER*
essa função deveria criar uma nova janela do navegador que edita as informações do quadro, e não um modal no site