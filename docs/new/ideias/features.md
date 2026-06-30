







## 01 - NOTAS EM GRID ##

a ideia consiste em uma tela kambam onde o usuario pode criar notas, textos soltos, referenciar tarefas, ligar quadros com setas, criar graficos e etc

a tela tambem adiciona o botão "nova nota", que abre uma pop-up no dispositivo do usuario, permitindo ser fixada na tela
assim o usuario pode fazer anotaçoes em tempo real enquanto trabalha

é possivel referenciar tarefas dentro das notas usando //nome da tarefa

ao digitar "//" o sistema deve abrir um campo de seleção, exibindo todas as tarefas que o usuario tem, separando por tarefas pessoais e da org
conforme o usuario digita, as tarefas exibidas diminuem, sendo filtradas pelo texto que o usuario digita.

ex:

input do usuario: //tes

tarefas exibidas no campo de seleção:
teste de api, teste de experiencia do usuario, testar a pagina de tarefas da org.


*FEATURES DO QUADRO:*
    - nova tarefa com popup estilo bloco de notas
    - ligar quadros com setas
    - desenho livre no quadro
    - criar to-do lists
    - referenciar tarefas por texto com //, com quadros de tarefas(quadros que apenas referenciam tarefas, permite o usuario mudar o status da tarefa ali mesmo)
    - adicionar tarefas nas to-do lists, marcando elas como concluidas caso sejam marcas nas to-do lists
    - quadros drag-and-drop

*REFERENCIAS*
    - milanote(como integração aos sistemas do marco)