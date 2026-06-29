<div align="center">

# Métricas de Clasificación

<br>

<span style="font-size: 1.2em;">
Aplicación web interactiva para aprender Accuracy, Precision, Recall y F1-Score mediante una dinámica multijugador inspirada en El Pueblo Duerme
</span>

<br><br>

[Ver aplicación desplegada](https://metricas-clasificacion.onrender.com/) ·
[Ver repositorio en GitHub](https://github.com/drojas-7u7/metricas-clasificacion)

</div>

---

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-Backend-000000?style=for-the-badge&logo=express&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-Tiempo%20real-010101?style=for-the-badge&logo=socket.io&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Render](https://img.shields.io/badge/Render-Despliegue-46E3B7?style=for-the-badge&logo=render&logoColor=black)
![Estado](https://img.shields.io/badge/Estado-Desplegado-success?style=for-the-badge)

---

## Contenidos

| Sección | Enlace |
|---------|--------|
| Resumen del proyecto | [Ir a sección](#resumen-del-proyecto) |
| Estado del proyecto | [Ir a sección](#estado-del-proyecto) |
| Demo | [Ir a sección](#demo) |
| Funcionamiento de la dinámica | [Ir a sección](#funcionamiento-de-la-dinámica) |
| Métricas trabajadas | [Ir a sección](#métricas-trabajadas) |
| Secciones de la aplicación | [Ir a sección](#secciones-de-la-aplicación) |
| Estructura del proyecto | [Ir a sección](#estructura-del-proyecto) |
| Herramientas utilizadas | [Ir a sección](#herramientas-utilizadas) |
| Justificación técnica | [Ir a sección](#justificación-técnica) |
| Instalación local | [Ir a sección](#instalación-local) |
| Despliegue | [Ir a sección](#despliegue) |
| Limitaciones | [Ir a sección](#limitaciones) |
| Requisitos | [Ir a sección](#requisitos) |
| Autor | [Ir a sección](#autor) |

---

## Resumen del proyecto

**Métricas de Clasificación** es una aplicación web interactiva desarrollada con **Node.js**, **Express**, **Socket.IO**, **HTML**, **CSS** y **JavaScript vanilla** para enseñar métricas de clasificación de forma práctica y participativa.

El proyecto transforma una dinámica inspirada en **El Pueblo Duerme** en un problema de clasificación binaria:

- los **asesinos** representan la clase positiva real;
- los **vecinos** representan la clase negativa real;
- las personas **expulsadas por votación** representan predicciones positivas;
- las personas **no expulsadas** representan predicciones negativas.

A partir del resultado final de la partida, la aplicación calcula y explica:

- Confusion Matrix;
- Accuracy;
- Precision;
- Recall;
- F1-Score.

El objetivo no es solo mostrar fórmulas, sino ayudar a entender qué significa cada error y por qué una métrica puede ser adecuada o engañosa según el contexto.

---

## Estado del proyecto

Proyecto desarrollado como píldora didáctica interactiva para explicar métricas de clasificación.

Estado actual:

- Aplicación web funcional.
- Experiencia multijugador en tiempo real.
- Roles privados para jugadores.
- Vista segura para narrador/proyector.
- Flujo completo de partida.
- Fase de noche.
- Fase de discusión.
- Fase de votación.
- Desempate.
- Resultados finales.
- Cálculo dinámico de métricas.
- Página de resultados conectada con la última partida.
- Secciones educativas completas.
- Simulador básico de métricas.
- Despliegue público en Render.
- Acceso validado desde redes externas.

---

## Demo

Aplicación desplegada públicamente:

```text
https://metricas-clasificacion.onrender.com/
````

Ejecución local:

```bash
npm install
npm start
```

URL local:

```text
http://localhost:3000
```

---

## Funcionamiento de la dinámica

La aplicación permite crear un pueblo como narrador y que el resto de personas se unan como jugadores mediante un código.

Flujo principal:

1. El narrador crea un pueblo.
2. Los jugadores se unen con el código.
3. El narrador cierra el pueblo y configura la partida.
4. La aplicación asigna roles privados.
5. Los asesinos actúan durante la noche.
6. El pueblo discute.
7. El pueblo vota para expulsar a una persona.
8. La partida avanza por rondas.
9. Al final, se muestran los resultados y las métricas.

La clave didáctica está en que el juego se interpreta como un modelo de clasificación:

| Elemento del juego     | Equivalente en clasificación |
| ---------------------- | ---------------------------- |
| Asesino                | Clase positiva real          |
| Vecino                 | Clase negativa real          |
| Expulsado por votación | Predicción positiva          |
| No expulsado           | Predicción negativa          |
| Asesino expulsado      | True Positive                |
| Vecino expulsado       | False Positive               |
| Vecino no expulsado    | True Negative                |
| Asesino que escapa     | False Negative               |

---

## Métricas trabajadas

### Confusion Matrix

La matriz de confusión permite separar los aciertos y errores del modelo:

* **TP**: asesino expulsado correctamente.
* **FP**: vecino expulsado por error.
* **TN**: vecino no expulsado.
* **FN**: asesino que no fue descubierto.

### Accuracy

Mide los aciertos globales sobre el total.

```text
Accuracy = (TP + TN) / (TP + TN + FP + FN)
```

Es útil cuando las clases están equilibradas y todos los errores tienen un coste parecido.

### Precision

Mide la fiabilidad del modelo cuando predice positivo.

```text
Precision = TP / (TP + FP)
```

En la dinámica, responde a la pregunta:

```text
Cuando el pueblo expulsa a alguien, ¿cuántas veces acierta?
```

### Recall

Mide cuántos positivos reales fueron detectados.

```text
Recall = TP / (TP + FN)
```

En la dinámica, responde a la pregunta:

```text
De todos los asesinos reales, ¿cuántos descubrió el pueblo?
```

### F1-Score

Resume el equilibrio entre Precision y Recall.

```text
F1 = 2 × (Precision × Recall) / (Precision + Recall)
```

Es útil cuando necesitamos valorar el equilibrio entre detectar positivos reales y evitar falsas alarmas.

---

## Secciones de la aplicación

La aplicación está organizada en varias rutas:

| Ruta           | Descripción                            |
| -------------- | -------------------------------------- |
| `/`            | Portada del proyecto                   |
| `/game`        | Dinámica multijugador                  |
| `/results`     | Informe de la última partida           |
| `/definitions` | Explicación didáctica de las métricas  |
| `/cases`       | Casos reales de aplicación             |
| `/debate`      | Pregunta ética para discusión en grupo |
| `/simulator`   | Simulador básico de TP, FP, TN y FN    |
| `/closing`     | Cierre conceptual de la píldora        |

La sección `/results` y parte de `/definitions` se alimentan dinámicamente de la última partida completada.

Si todavía no hay partida finalizada, la aplicación muestra un mensaje invitando a jugar la dinámica para generar un ejemplo real.

---

## Estructura del proyecto

```text
metricas-clasificacion/
│
├── README.md                  ← Documentación principal del proyecto
├── package.json               ← Configuración del proyecto Node.js
├── package-lock.json          ← Versiones bloqueadas de dependencias
├── render.yaml                ← Configuración de despliegue en Render
├── server.js                  ← Servidor Express + Socket.IO
│
└── public/                    ← Archivos estáticos de la aplicación
    │
    ├── index.html             ← Estructura principal de la web
    │
    ├── css/
    │   └── styles.css         ← Estilos visuales
    │
    └── js/
        └── app.js             ← Lógica de cliente, interfaz y Socket.IO
```

---

## Herramientas utilizadas

* **Node.js**: entorno de ejecución del servidor.
* **Express**: servidor web y rutas principales.
* **Socket.IO**: comunicación en tiempo real entre narrador y jugadores.
* **HTML5**: estructura de la aplicación.
* **CSS3**: diseño visual y experiencia de usuario.
* **JavaScript vanilla**: lógica de cliente sin framework frontend.
* **Render**: despliegue público de la aplicación.
* **Git y GitHub**: control de versiones y repositorio remoto.

---

## Justificación técnica

Se utiliza **Node.js + Express + Socket.IO** porque el proyecto necesita una experiencia multijugador en tiempo real.

Socket.IO permite que:

* los jugadores entren al mismo pueblo;
* el narrador controle las fases;
* los cambios de estado se reflejen en todas las pantallas;
* la votación y los resultados se actualicen sin recargar manualmente.

Se utiliza **JavaScript vanilla** en el frontend para mantener el proyecto simple, transparente y fácil de explicar en un contexto formativo.

La aplicación mantiene el estado de las partidas en memoria. Esto simplifica la arquitectura y es suficiente para una demo didáctica, aunque no sería la opción adecuada para producción con persistencia real.

---

## Instalación local

Clonar el repositorio:

```bash
git clone git@github.com:drojas-7u7/metricas-clasificacion.git
```

Entrar en la carpeta:

```bash
cd metricas-clasificacion
```

Instalar dependencias:

```bash
npm install
```

Ejecutar la aplicación:

```bash
npm start
```

Abrir en el navegador:

```text
http://localhost:3000
```

---

## Despliegue

El proyecto está desplegado en Render:

```text
https://metricas-clasificacion.onrender.com/
```

La configuración de despliegue está definida en:

```text
render.yaml
```

Configuración principal:

```text
runtime: node
buildCommand: npm install
startCommand: npm start
healthCheckPath: /health
```

El servidor usa la variable de entorno `PORT` y escucha en `0.0.0.0`, lo que permite el despliegue en plataformas cloud.

---

## Limitaciones

Este proyecto está diseñado como herramienta didáctica y demo interactiva.

Limitaciones principales:

* Las partidas se guardan en memoria.
* Si el servidor se reinicia, las partidas activas se pierden.
* En Render Free, el servicio puede dormir tras un periodo de inactividad.
* La primera carga después de estar dormido puede tardar un poco más.
* No hay base de datos persistente.
* No hay sistema de autenticación.
* No está pensado como producto final de producción, sino como recurso educativo interactivo.

---

## Requisitos

Dependencias principales:

```text
express
socket.io
```

Versión de Node recomendada:

```text
Node.js >=20.0.0 <25.0.0
```

Las versiones concretas están fijadas en `package-lock.json`.

---

## Autor

David Rojas Cruz

Proyecto desarrollado como parte de una píldora didáctica sobre métricas de clasificación dentro del bootcamp de Inteligencia Artificial.
