<template>
  <h1>nuxt-lazyload-files playground</h1>

  <section class="plain">
    <h2>plain.css file was imported, because window width is higher than 1px</h2>
  </section>

  <hr >

  <h3>Resize your window to be less than 1000px</h3>
  <section class="scss">
    <h2>Woohoo it scss and sass files loaded!</h2>
  </section>

  <hr >

  <section class="less">
    <h2>less.less loaded, because window width is lower than 4000px!</h2>
  </section>
  
  <hr >

  <section class="stylus">
    <h2>stylus files loaded</h2>
  </section>
</template>

<style>
  section {
    display: none;
  }
</style>
