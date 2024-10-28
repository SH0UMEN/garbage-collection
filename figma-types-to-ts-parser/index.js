const collectTypes = (table) => {
	const rowSelector = 'tbody > tr', nameSelector = 'td:first-child [class^=format--mono--]', propertiesSelector = '[class^=developer_docs--propField]';
	const propertyNameSelector = '[class^=developer_docs--monoDisplay]', propertyTypesSelector = '[class^=format--string]', propertyLinkSelector = '[class^=developer_docs--propDesc] a';
	const rows = table.querySelectorAll(rowSelector);
	const types = {};

	rows.forEach((row) => {
		const name = row.querySelector(nameSelector).textContent;
		const properties = row.querySelectorAll(propertiesSelector);

		for(let property of Array.from(properties)) {
			const propertyNameNode = property.querySelector(propertyNameSelector);

			if(propertyNameNode == null) {
				let mainTypes = property.querySelectorAll(propertyLinkSelector);
				if(mainTypes.length > 0)
					types[name] = Array.from(mainTypes).map((type) => type.textContent).join(' | ');
				else if((mainTypes = property.querySelectorAll(propertyTypesSelector)).length > 0)
					types[name] = Array.from(mainTypes).map((type) => '\'' + type.textContent.replace('[DEPRECATED] ', '') + '\'').join(' | ');
			} else {
				let typesRendered;

				const propertyName = propertyNameNode.textContent;

				let propertyTypes = property.querySelectorAll(propertyTypesSelector);
				if(propertyTypes.length > 0)
					typesRendered = Array.from(propertyTypes).map((type) => '\'' + type.textContent.replace('[DEPRECATED] ', '') + '\'').join(' | ');
				else
					typesRendered = propertyNameNode.nextElementSibling.textContent.replaceAll('"', '\'');

				(types[name] || (types[name] = {}))[propertyName] = typesRendered;
			}
		}
	});

	return types;
};

const makeReplacements = (content) => {
	const replacements = {
		'CornerRadius': 'number',
		'Transform': 'Array<Array<number>>',
		'Number': 'number',
		'Boolean': 'boolean',
		'String': 'string',
		'Any': 'any'
	};

	for(let name in replacements)
		content = content.replaceAll(name, replacements[name]);

	return content;
};

const toCamelCase = (str) => {
	if(str.includes(' | '))
		return str;

	str = str.includes('_') ? str.split('_') : str.split(' ');
	return str.filter((word) => word.length !== 1 || word !== '%')
		.map((word) => word[0].toUpperCase() + (word === word.toUpperCase() ? word.slice(1).toLowerCase() : word.slice(1)))
		.join('');
};

const writeType = (alias, content, parentType) => {
	if(typeof content === 'string')
		return 'type ' + alias + ' = ' + toCamelCase(makeReplacements(content)) + ';';

	let result = 'type ' + alias + ' = ' + (parentType == null ? '' : parentType + ' & ') + '{\n';

	for(let name in content) {
		const property = content[name];
		if(!property.includes('|')) {
			result += '\t' + name + ': ' + makeReplacements(content[name]) + ';\n';
			continue;
		}

		let typeName = name[0].toUpperCase() + name.slice(1);
		if(!typeName.startsWith(alias))
			typeName = alias + typeName;

		const typeRendered = property.startsWith('\'') ? writeEnum(typeName, property) : writeType(typeName, property);

		result = typeRendered + '\n\n' + result;
		result += '\t' + name + ': ' + typeName + ';\n';
	}

	return result + '}';
};

const writeEnum = (name, values) => {
	values = values.split('|').map(value => value.trim());
	values = values.filter((value, index) => values.indexOf(value) === index);
	values = values.map((value, index) => '\t' + toCamelCase(value.slice(1, value.length - 1)) + ' = ' + value + (index == values.length - 1 ? '' : ',') + '\n');

	return 'enum ' + name + ' {\n' + values.join('') + '}';
};

const parseTypesToTS = (table, parentType, blockExports, typesToImport) => {
	const types = table instanceof HTMLTableElement ? collectTypes(table) : table;
	let exports = '\n\nexport {\n' + (parentType != null ? '\t' + parentType + ',\n' : '');
	let result = '';

	for(let name in types) {
		if(result.length > 0)
			result += '\n\n';

		const properties = types[name], isEnum = typeof properties === 'string' && properties.startsWith('\'');

		if(name.includes('_'))
			name = name.split('_').map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join('');

		name = name.toUpperCase() === name ? name[0] + name.slice(1).toLowerCase() : name;

		if(!blockExports)
			exports += '\t' + name + ',\n';
		if(typesToImport != null && typesToImport.includes(name))
			typesToImport.splice(typesToImport.indexOf(name), 1);

		result += isEnum ? writeEnum(name, properties) : writeType(name, properties, parentType);
	}

	return result + (blockExports ? '' : exports + '};');
};

const parseFigmaData = () => {
	const propertiesFile = './properties.js';
	const result = {}, properties = collectTypes(document.querySelector('#files-types table'));
	result['properties'] = parseTypesToTS(properties);

	const imports = Object.keys(properties);
	imports.push('StyleType');

	const types = parseTypesToTS(document.querySelector('#global-properties table'), null, true, imports) +
						'\n\n' +
						parseTypesToTS(document.querySelector('#node-types table'), 'Node', false, imports);

	result['node'] = 'import { ' + imports.join(', ') + ' } from \'' + propertiesFile + '\';\n\n' + types;

	return result;
};