-- Asigna categoría a productos activos que hoy están sin categoría (category_id IS NULL),
-- emparejando por nombre exacto contra una categoría existente. Solo toca filas con
-- category_id NULL — nunca sobrescribe una categoría ya asignada. No afecta sales/sale_items.

update products p
set category_id = c.id
from categories c
where p.category_id is null
  and c.name = case p.name
    when 'Aretas flor' then 'BISUTERIA'
    when 'Bausi Jeans Strech' then 'BAUSI'
    when 'Bermuda Mujer Bausi' then 'Bermudas Bausi'
    when 'BLUSA MATTELSA AZUL' then 'MATTELSA BLUSAS'
    when 'Blusas Mattelsa' then 'MATTELSA BLUSAS'
    when 'Bodys Mattelsa' then 'MATTELSA'
    when 'Bolsa de regalo ovalo' then 'EMPAQUES'
    when 'Bolsa de regalo vertical' then 'EMPAQUES'
    when 'Bolsa regalo rombos' then 'EMPAQUES'
    when 'Boxer Hombre Surtidos' then 'Boxer Hombre Surtidos'
    when 'BUZO AMERICANINO' then 'AMERICANINO'
    when 'BUZO MATTELSA MUJER' then 'MATTELSA'
    when 'Camisa Mattelsa' then 'MATTELSA'
    when 'Camisa Over Boxy Bausi' then 'BAUSI'
    when 'Cargo Yoko' then 'Cargo Yoko'
    when 'Collar perlas blancas' then 'BISUTERIA'
    when 'ESPRIT CAMISA BLANCA' then 'ESPRIT'
    when 'Faldas Mattelsa' then 'MATTELSA'
    when 'Jeans Bausi Mom' then 'Bausi Mom'
    when 'Jeans Bausi Strech' then 'BAUSI'
    when 'Jeans Mattelsa' then 'MATTELSA JEANS'
    when 'JEANS PRAGA LEG' then 'PRAGA'
    when 'Mattelsa Blusa' then 'MATTELSA BLUSAS'
    when 'MATTELSA BLUSAS MUJER' then 'MATTELSA BLUSAS'
    when 'Mattelsa Bodys' then 'MATTELSA'
    when 'Mattelsa camiseta hombre' then 'MATTELSA HOMBRE'
    when 'MATTELSA CAMISILLAS HOMBRE' then 'MATTELSA HOMBRE'
    when 'MATTELSA PANTALON' then 'MATTELSA'
    when 'MATTELSA PANTALON DAMA' then 'MATTELSA'
    when 'MELISA' then 'MELISA'
    when 'PRAGA JEAN DAMA' then 'PRAGA'
    when 'PRAGA JEAN DAMA TALLA 12' then 'PRAGA'
    when 'RIFLE BLUSAS' then 'RIFLE'
    when 'Short Hombre Mattelsa' then 'MATTELSA SHORT'
    when 'Short Mattelsa' then 'MATTELSA SHORT'
    when 'Sudaderas Mattelsa' then 'MATTELSA'
    when 'Vestidos Mattelsa' then 'MATTELSA VESTIDOS'
    else null
  end;

-- No tocados a propósito (sin categoría clara, quedan sin cambios):
-- Bermuda Rigida Regular HB, CAMISETA HOMBRE VERDE, Camiseta Polo Hombre,
-- CHAQUETA ESTRELLAS, CHAQUETA NARANJA, ELA moka talla XS,
-- LEO CAMISETA HOMBRE RAYAS VERDES, PT20008, VELEZ CAMISA BLANCA
