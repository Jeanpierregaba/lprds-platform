# DESIGN.MD --- Les petits rayons de soleil

## 0. Objectif

Ce document définit le système de design à respecter pour la refonte du
site web de **Les petits rayons de soleil --- la maison de l'éveil**.

Le site doit transmettre : - la joie de vivre ; - l'éveil et
l'apprentissage ; - la bienveillance ; - la sécurité ; - l'énergie et la
créativité ; - un univers chaleureux, ludique et rassurant pour les
enfants et les parents.

L'interface doit être **moderne, professionnelle, très visuelle et
enfantine sans être infantilisante**.

> Règle fondamentale : ne pas transformer le site en accumulation de
> couleurs, d'animations ou d'illustrations. Les éléments ludiques
> doivent être utilisés avec intention et conserver une hiérarchie
> visuelle claire.

------------------------------------------------------------------------

# 1. Identité visuelle

## 1.1 Univers

L'identité repose sur quatre idées principales :

**☀️ Soleil + 🌊 Fraîcheur + 🌿 Nature + 🌈 Enfance**

Le logo et l'illustration animée de la crèche constituent les références
visuelles principales.

Le langage graphique doit privilégier : - formes organiques ; - coins
arrondis ; - blobs ; - nuages ; - étoiles ; - rayons de soleil ; -
petites éclaboussures de peinture ; - illustrations d'enfants ; -
éléments dessinés à la main ; - ombres douces ; - animations courtes et
naturelles.

Éviter : - les interfaces trop corporate ; - les cartes avec des angles
très carrés ; - les gradients excessifs ; - les animations permanentes
qui distraient ; - l'utilisation simultanée de toutes les couleurs de la
palette.

------------------------------------------------------------------------

# 2. Palette de couleurs

  -----------------------------------------------------------------------
  Nom                     HEX                     Usage
  ----------------------- ----------------------- -----------------------
  Jaune Soleil            `#F5AA2D`               Couleur primaire, CTA,
                                                  éléments clés

  Orange Doux             `#F6C434`               Accents chaleureux,
                                                  illustrations, hover

  Turquoise               `#4D9F92`               Boutons secondaires,
                                                  sections, éléments
                                                  interactifs

  Bleu Ciel               `#205996`               Liens, éléments
                                                  secondaires

  Bleu Profond            `#28337E`               Titres, navigation,
                                                  texte fort

  Rose Framboise          `#E3107F`               Accents, badges,
                                                  éléments ludiques

  Vert Nature             `#6FAE5B`               Nature, activités,
                                                  environnement

  Blanc Nuage             `#FFFFFF`               Fond principal

  Crème Soleil            `#FFF8E8`               Fonds chaleureux

  Bleu Très Clair         `#EAF7F6`               Fonds de sections

  Gris Bleuté             `#3F4654`               Texte courant
  -----------------------------------------------------------------------

### Hiérarchie

**Primaire :** `#F5AA2D`\
CTA principaux, éléments importants, highlights et accents liés au
soleil.

**Secondaire :** `#4D9F92`\
Boutons secondaires, navigation secondaire, sections et éléments
interactifs.

**Contraste :** `#28337E`\
Titres, navigation, textes importants et éléments nécessitant une forte
lisibilité.

**Accents :** `#E3107F`, `#6FAE5B`, `#F6C434`\
À utiliser avec parcimonie.

**Fonds :** `#FFFFFF`, `#FFF8E8`, `#EAF7F6`

------------------------------------------------------------------------

# 3. Typographie

## 3.1 Titres --- Fredoka One

La police principale des titres est **Fredoka One**.

Utiliser Fredoka One pour : - H1 ; - H2 ; - H3 ; - titres de sections
; - grands messages marketing ; - titres courts de cartes.

Ne pas utiliser Fredoka One pour les paragraphes longs.

## 3.2 Texte --- Work Sans

La police secondaire est **Work Sans**.

Utiliser Work Sans pour : - paragraphes ; - descriptions ; - navigation
; - formulaires ; - labels ; - informations pratiques ; - footer.

Poids recommandés : - Regular : `400` - Medium : `500` - SemiBold :
`600` - Bold : `700`

## 3.3 Hiérarchie

``` text
H1 → Fredoka One → 48–64px desktop
H2 → Fredoka One → 36–48px desktop
H3 → Fredoka One → 28–32px desktop
H4 → Fredoka One → 22–26px desktop

Body → Work Sans → 16–18px
Small → Work Sans → 14px
Caption → Work Sans → 12–13px
```

Sur mobile, réduire les tailles progressivement sans casser la
hiérarchie.

------------------------------------------------------------------------

# 4. Boutons

## 4.1 Concept

Les boutons doivent reprendre le principe visuel du bouton de référence
fourni :

-   forme fortement arrondie ;
-   fond coloré ;
-   couche/épaisseur visible sous le bouton ;
-   sensation de bouton physique ;
-   ombre basse plutôt qu'une simple ombre diffuse ;
-   interaction au clic donnant réellement l'impression que le bouton
    s'enfonce.

Le bouton doit ressembler à un **bouton physique ludique**.

## 4.2 Dimensions

``` text
Desktop : 52–60px de hauteur
Mobile  : 48–56px
Padding horizontal : 24–32px
Border radius : 9999px
```

## 4.3 Bouton principal

``` text
Background : #F5AA2D
Layer      : #D88D16
Text       : #FFFFFF
```

Exemple conceptuel :

``` text
┌─────────────────────────────┐
│       Découvrir la crèche → │
└─────────────────────────────┘
███████████████████████████████
        couche inférieure
```

La couche inférieure doit être visible de quelques pixels.

## 4.4 Bouton secondaire

``` text
Background : #4D9F92
Layer      : #327D73
Text       : #FFFFFF
```

## 4.5 Bouton tertiaire

``` text
Background : transparent
Border     : #4D9F92 ou #28337E
Text       : #28337E
```

------------------------------------------------------------------------

# 5. Animation des boutons

## Hover

Au survol : - légère élévation ; - couche inférieure légèrement plus
visible ; - transition douce.

``` css
transition:
  transform 120ms ease-out,
  box-shadow 120ms ease-out;
```

## Active / Click

Au clic, le bouton doit donner l'impression de s'enfoncer.

``` css
.button {
  transform: translateY(0);
}

.button:active {
  transform: translateY(3px);
}
```

Durée recommandée : **100--140ms**, avec `ease-out` ou `ease-in-out`.

L'effet doit être perceptible mais subtil.

## Focus

Toujours conserver un indicateur de focus accessible. Ne jamais le
supprimer complètement.

------------------------------------------------------------------------

# 6. Cartes et composants

## Cartes

``` text
border-radius : 16–24px
```

Utiliser des ombres douces :

``` css
box-shadow:
  0 8px 24px rgba(40, 51, 126, 0.08);
```

Éviter les ombres noires fortes.

## Cartes d'activités

-   Épanouissement → Jaune `#F5AA2D`
-   Apprentissage → Turquoise `#4D9F92`
-   Sécurité → Rose `#E3107F`
-   Nature → Vert `#6FAE5B`

Les fonds doivent rester très clairs.

------------------------------------------------------------------------

# 7. Icônes

Les icônes doivent être : - colorées ; - arrondies ; - simples ; -
ludiques ; - cohérentes entre elles.

Bibliothèques recommandées : - Lordicon ; - Lottie ; - Rive.

Les animations doivent rester courtes et utiles.

Exemples : - ☀️ Épanouissement - 📚 Apprentissage - ❤️ Sécurité - 🌱
Nature - 🎨 Créativité - 🎵 Musique - ⚽ Sport - 🧩 Jeux

Ne pas mélanger des styles d'icônes incompatibles.

------------------------------------------------------------------------

# 8. Illustrations

Les illustrations doivent reprendre l'univers de l'image animée de la
crèche : - enfants noirs et africains ; - expressions joyeuses ; -
couleurs vives ; - environnement naturel ; - jeux ; - école/crèche ; -
activités éducatives ; - interactions entre enfants.

Style recherché :

**cartoon moderne + chaleureux + premium + coloré.**

Éviter les illustrations génériques sans cohérence avec la marque.

------------------------------------------------------------------------

# 9. Hero section

Le hero doit immédiatement communiquer :

> **Les petits rayons de soleil --- la maison de l'éveil**

Structure recommandée :

``` text
┌───────────────────────────────────────────────────────┐
│ HEADER                                                │
├───────────────────────────────┬───────────────────────┤
│ Titre Fredoka One             │                       │
│ Texte Work Sans               │ Illustration /        │
│ [ CTA principal ]             │ image animée          │
│ [ CTA secondaire ]            │ de la crèche          │
└───────────────────────────────┴───────────────────────┘
```

L'illustration animée de la cour de la crèche peut être l'élément visuel
principal.

Ajouter éventuellement : - nuages ; - petits rayons ; - étoiles ; -
formes organiques ; - petits éléments flottants.

Ne pas surcharger l'image principale.

------------------------------------------------------------------------

# 10. Formes graphiques

Les séparateurs de sections peuvent utiliser : - vagues ; - nuages ; -
blobs ; - formes organiques ; - éclaboussures ; - demi-cercles.

Couleurs privilégiées :

``` text
#F5AA2D
#4D9F92
#EAF7F6
#FFF8E8
```

------------------------------------------------------------------------

# 11. Espacements

Utiliser un système basé sur 8px :

``` text
4px
8px
16px
24px
32px
48px
64px
80px
96px
```

Éviter les valeurs arbitraires lorsque ce n'est pas nécessaire.

Sections desktop :

``` text
padding vertical : 80–96px
```

Sections mobile :

``` text
padding vertical : 48–64px
```

------------------------------------------------------------------------

# 12. Layout

Container recommandé :

``` text
max-width : 1200–1280px
margin : auto
```

Grilles :

``` text
Desktop : 3 ou 4 colonnes
Tablet  : 2 colonnes
Mobile  : 1 colonne
Gap     : 24px
```

------------------------------------------------------------------------

# 13. Navigation

La navigation doit être : - claire ; - légère ; - arrondie ; - moderne
; - facile à utiliser par les parents.

Texte principal :

``` text
#28337E
```

CTA :

``` text
#F5AA2D
```

Le header peut être blanc avec une ombre très légère.

Sur mobile : - menu hamburger ; - transitions douces ; - boutons
suffisamment grands ; - interactions faciles au doigt.

------------------------------------------------------------------------

# 14. États UI

Tous les composants interactifs doivent posséder :

``` text
Default
Hover
Focus
Active
Disabled
```

Transitions UI :

``` text
120ms – 250ms
```

Animations décoratives :

``` text
300ms – 800ms
```

Respecter `prefers-reduced-motion`.

------------------------------------------------------------------------

# 15. Micro-interactions

### Boutons

``` text
Hover → légère élévation
Click → enfoncement
```

### Cartes

``` text
Hover → légère translation verticale
```

### Icônes

``` text
Hover → petite animation
```

### Illustrations

``` text
Entrée dans le viewport → apparition douce
```

### Décorations

``` text
Nuages → déplacement très lent
Soleil → légère oscillation
Étoiles → petit scale/pulse
```

Les animations ne doivent jamais gêner la lecture.

------------------------------------------------------------------------

# 16. Accessibilité

Respecter : - contraste suffisant ; - tailles de texte lisibles ; -
boutons facilement cliquables ; - focus visible ; - navigation clavier
; - `alt` sur les images pertinentes ; - `aria-label` lorsque nécessaire
; - `prefers-reduced-motion`.

Ne jamais utiliser uniquement la couleur pour transmettre une
information.

------------------------------------------------------------------------

# 17. Responsive Design

Approche **mobile-first**.

Breakpoints indicatifs :

``` text
Mobile      < 640px
Tablet      640–1024px
Desktop     1024–1280px
Large       > 1280px
```

Sur mobile : - réduire les décorations ; - éviter les illustrations qui
masquent le contenu ; - garder les CTA visibles ; - conserver de gros
boutons ; - réduire les animations décoratives ; - préserver la
lisibilité.

------------------------------------------------------------------------

# 18. Règles de cohérence

1.  Fredoka One pour les titres.
2.  Work Sans pour les textes.
3.  Bleu profond `#28337E` pour les titres et éléments forts.
4.  Jaune `#F5AA2D` pour les CTA principaux.
5.  Turquoise `#4D9F92` pour les CTA secondaires.
6.  Rose, vert et orange uniquement comme accents.
7.  Coins arrondis sur les composants.
8.  Boutons avec effet de couche inférieure.
9.  Clic avec effet d'enfoncement.
10. Animations courtes et naturelles.
11. Illustrations cohérentes avec l'univers de la crèche.
12. Ne jamais surcharger une section avec toutes les couleurs.
13. Maintenir suffisamment d'espace blanc.
14. Préserver une apparence professionnelle destinée aux parents.
15. Design joyeux pour les enfants mais rassurant pour les parents.

------------------------------------------------------------------------

# 19. Direction artistique globale

Le résultat final doit donner l'impression d'un :

> **site moderne de crèche premium, chaleureux, joyeux, africain,
> ludique et rassurant.**

Il ne faut pas chercher à reproduire une interface de jeu vidéo.

La référence émotionnelle est :

**☀️ Joie + ❤️ Bienveillance + 🧠 Éveil + 🌱 Nature + 🎨 Créativité**

Chaque élément du site doit contribuer à cette perception.

------------------------------------------------------------------------

# 20. Checklist de validation

-   [ ] Fredoka One utilisée pour les titres.
-   [ ] Work Sans utilisée pour les textes.
-   [ ] Palette respectée.
-   [ ] CTA principal en jaune soleil.
-   [ ] CTA secondaire en turquoise.
-   [ ] Boutons avec couche inférieure visible.
-   [ ] Clic avec effet d'enfoncement.
-   [ ] États hover/focus/active implémentés.
-   [ ] Cartes avec rayons généreux.
-   [ ] Ombres douces.
-   [ ] Illustrations cohérentes avec l'univers.
-   [ ] Animations subtiles.
-   [ ] `prefers-reduced-motion` respecté.
-   [ ] Responsive mobile correctement traité.
-   [ ] Contrastes accessibles.
-   [ ] Pages non surchargées.
-   [ ] Résultat professionnel pour les parents.
