---
<% (ename.trim().indexOf(' ') >=0 ? 'aliases: "' + ename + '"' : 'aliases:') %>
<% (tagStr ? 'tags: "' + tagStr +'"': 'tags:')  %>
created_on: <% tp.date.now("YYYY-MM-DD") %>
<% (countryResidence ? 'country_residence: "' + countryResidence + '"' : 'country_residence:') %>
<% (companyName  ? 'company: "' + companyName + '"' : 'company:') %>
office:
office_country:
record_type: personNote
---
# Персона <% ename %>

## Контактные данные
ФИО:: <% ename %>
телефон:: 
email:: 
Фото:: 
ДР:: 
<% taxID ? 'ИНН:: ' + taxID : '' %>

### Родственные связи

## Биография

## Расположение
Страна:: <% countryResidence %>
Город:: 
Компания:: <% (companyName ? '[['+companyNoteFile+'|'+companyName+']]' : null) %>
Должность:: <% positions && positions.length ?  positions : '' %>
Начальник:: 

## Опыт работы
### Места работы и навыки
### Упоминания, связи

## Проекты

---
## 📝Log

### <% tp.date.now("YYYY-MM-DD") %> - Начальная запись

notes_go_here
