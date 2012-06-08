//DBG = function(x) { document.write("<p>DBG: " + x + "</p>"); };
//DBG = function(x) { console.log("DBG: " + x); };

function LogicProgram() {
}

LogicProgram.prototype.addToKey = function(key, clause) {
	if(this[key]) {
		this[key].push(clause);
	} else {
		this[key] = [clause];
	}
};

LogicProgram.prototype.add = function(index, clause) {
	// A key to match longer indexes matching this
	this.addToKey(index.join(":") + ":*", clause);
	// For every prefix (including full), add a key to match shorter or equal indexes
	for(var i = 2; i <= index.length; i+=2) {
		this.addToKey(index.slice(0, i).join(":"), clause);
	}
}

LogicProgram.prototype.addBuiltin = function(name, arity, func) {
	this.add(["builtin#" + name, arity], function(logic, term, next) {
		var termCopy = [];
		for(var i = 0; i < term.length; i++) {
			termCopy.push(logic.realValue(term[i]));
		}
		if(func(logic, termCopy) && logic.unify(termCopy, term)) {
			logic.push(next);
		}
	});
};
function Logic(program) {
	this.stack = [];
	this.recentCalls = [];
	this.programIsLoaded = false;
	if(program) {
		this.program = program;
	} else {
		this.program = new LogicProgram();
	}
	this.contexts = {};
}
Logic.prototype.push = function(f) {
	this.stack.push(f);
};

Logic.prototype.run = function(term, next) {
	var stackLevel = this.stack.length;
	if(this.isRemote) {
		this.runRemote(term, next);
	} else {
		this.call(term, next);
		this.resume(stackLevel);
	}
};

Logic.prototype.process = function(stackLevel) {
	this.count = 1000000;
	while(this.running && this.stack.length > stackLevel) {
		this.count--;
		if(this.count == 0) {
			throw Error("Logic operation timed out. Recent calls:\n" + this.recentCalls.join("\n"));
		}
		this.stack.pop()();
	}	
}

Logic.prototype.pause = function() {
	this.running = false;
}

Logic.prototype.resume = function(stackLevel) {
	this.running = true;
	this.process(stackLevel);
};

Logic.prototype.unify = function(term1, term2) {
	// De-reference variables
	if(term1 instanceof Variable) {
		term1 = term1.getValue(this);
	}
	if(term2 instanceof Variable) {
		term2 = term2.getValue(this);
	}

	// Unify variables by binding
	if(term1 instanceof Variable) {
		term1.bind(term2, this);
		return true;
	}
	if(term2 instanceof Variable) {
		term2.bind(term1, this);
		return true;
	}

	// Unify compound terms
	if(term1 instanceof Array) {
		if(!(term2 instanceof Array))
			return false;
		if(term1.length != term2.length)
			return false;
		for(var i = 0; i <= term1.length; i++) {
			if(!this.unify(term1[i], term2[i]))
				return false;
		}
		return true;
	}

	// Unify general objects
	return term1 == term2;
};

Logic.prototype.clauseFunction = function(clause, term, next) {
	var logic = this;
	return function() { clause(logic, term, next); };
};

Logic.prototype.createIndex = function(term) {
	term = this.realValue(term);
	index = [];
	while(term instanceof Array) {
		index.push(term[0]);
		index.push(term.length-1);
		if(term.length > 1) {
			term = this.realValue(term[1]);
		} else {
			break;
		}
	}
	return index;
}

Logic.prototype.call = function(term, next) {
	//DBG("[" + this.stack.length + "] Call: " + this.termToString(term));
	this.recentCalls.push("[" + this.stack.length + "] Call: " + this.termToString(term));
	if(this.recentCalls.length > 100) {
		this.recentCalls.splice(0, this.recentCalls.length - 100);
	}
	term = this.realValue(term);
	
	// Build the longest possible index based on this term
	var index = this.createIndex(term);
	// Check that the predicate is defined
	if(!this.program[index.slice(0, 2).join(":")]) {
		throw "Undefined Predicate: " + index.slice(0, 2).join("/");
	}
	// Match this index with longer or equal clause indexes
	this.executeClauses(this.program[index.join(":")], term, next);
	// Match this index with shorter clause indexes
	for(var i = 2; i < index.length; i+=2) {
		this.executeClauses(this.program[index.slice(0, i).join(":") + ":*"], term, next);
	}
};
Logic.prototype.executeClauses = function(clauses, term, next) {
	if(!clauses)
		return;
	if(clauses.length > 100) {
		console.log("Improve indexing for: " + this.createIndex(term).join(":"));
	}
	for(var i = 0; i < clauses.length; i++) {
		var clause = clauses[i];
		var logic = this;
		this.push(this.clauseFunction(clause, term, next));
	}
}
Logic.prototype.termToString = function(term) {
	if(term instanceof Variable) {
		term = term.getValue(this);
	}
	if(term instanceof Variable) {
		return "_";
	} else if(typeof(term) == "string") {
		if(term.length < 10000) return '"' + term + '"';
		else return "...";
	} else if(typeof(term) == "number") {
		return term.toString();
	} else if(typeof(term) == "function") {
		return term.toString();
	} else if(!term) {
		return "<undefined>";
	}
	if(!(term instanceof Array)) {
		return term.toString();
	}
	var s = term[0];
	if(term.length > 1) {
		s += "(";
		for(var i = 1; i < term.length; i++) {
			if(i > 1) {s += ", ";}
			s += this.termToString(term[i]);
		}
		s += ")";
	}
	return s;
}

Logic.prototype.toString = function() { return "Logic"; };

Logic.prototype.realValue = function(val) {
	if(val instanceof Variable)
		return val.getValue(this);
	else
		return val;
};

// Evaluates the given ajax expression, and calls the callback for (each) solution
Logic.prototype.ajaxEval = function(expr, callback) {
	var stackLevel = this.stack.length;
	function doAjaxCalls(logic, Q, E, T, callback) {
		// If we need to make an AJAX call, let's make it...
		if(Q[0] == ".") {
			logic.pause(); // Do not undo bindings when we launch the AJAX request
			var getQuery = logic.realValue(Q[1]);
			$.get(logic.realValue(getQuery[1]), function(data, textStatus, jqXHR) {
				if(logic.unify(getQuery[2], ["::", eval(data), new Variable()])) {
					doAjaxCalls(logic, logic.realValue(Q[2]), E, T, callback);
				}
			});
		} else {
			// We do not need AJAX calls. We just need to evaluate the expression and call the callback
			var V = new Variable();
			logic.run(["/Functional#eval", E, T, V], function() {callback(logic, V.getValue());});
			logic.resume(stackLevel);
		}
	}


	// First we need to figure out the expression and the list of AJAX queries
	var logic = this.clone();
	var E = new Variable();
	var T = new Variable();
	var Q = new Variable();
	logic.run(["cjs#ajaxEval", expr, T, E, Q], function() {
		doAjaxCalls(logic, Q.getValue(logic), E.getValue(logic), T.getValue(logic), callback);
	});
}

// Run the given goal remotely, using an AJAX call to a logic server
Logic.prototype.runRemote = function(term, next) {
	var uri = "/logic/?program=" + encodeURIComponent(this.programURI) + "&query=" + encodeURIComponent(this.toJSON(term));
	var logic = this;
	var stackLevel = this.stack.length;
	$.get(uri, function(data, textStatus, jqXHR) {
		// Create alternatives for the different results
		var map = [];
		var results = logic.addReferences(data, map);
		for(var i = 0; i < results.length; i++) {
			var elem = results[i];
			logic.push(function() {
				logic.unify(elem, term);
				next();
			});
		}
		// Backtrack between the different alternatives
		logic.resume(stackLevel);
	});
};

// Load a logic program from the given URI, or keep the URI if this required to work remotely
Logic.prototype.load = function(programURI) {
	if(this.isRemote) {
		this.programURI = programURI;
		this.setProgramLoaded();
	} else {
		var logic = this;
		$.get(programURI, function(data) {
			logic.setProgramLoaded();
		});
	}
}

// Convert a term into JSON
Logic.prototype.toJSON = function(term) {
	var index = {i: 1};
	var state = this.stack.length;
	var json = JSON.stringify(this.removeCycles(term, index));
	while(this.stack.length > state) {
		this.stack.pop()();
	}
	return json;
};

// Create a term from JSON
Logic.prototype.fromJSON = function(json) {
	var map = [];
	var obj = JSON.parse(json);
	return this.addReferences(obj, map);
};



// Replace variables with to {var: number} pairs, allowing conversion to JSON
Logic.prototype.removeCycles = function(term, index) {
	term = this.realValue(term);
	if(term instanceof Variable) {
		this.unify(term, {"var": index.i++});
		return this.realValue(term);
	} else if(term instanceof Array){
		var newTerm = [];
		for(var i = 0; i < term.length; i++) {
			newTerm.push(this.removeCycles(term[i], index));
		}
		return newTerm;
	} else {
		return term;
	}
};

// Replace {var: number} pairs with references to actual variables
Logic.prototype.addReferences = function(term, map) {
	if(term["var"]) {
		if(!map[term["var"]]) {
			//DBG("New variable for: " + term["var"]);
			map[term["var"]] = new Variable();
		}
		//DBG("Returning: " + map[term["var"]]);
		return map[term["var"]];
	} else if(term instanceof Array){
		var newTerm = [];
		for(var i = 0; i < term.length; i++) {
			newTerm.push(this.addReferences(term[i], map));
		}
		//DBG("Returning compound: " + newTerm);
		return newTerm;
	} else {
		//DBG("Returning unmodified term: " + term);
		return term;
	}
};

Logic.prototype.onProgramLoaded = function(callback) {
	if(this.programIsLoaded) {
		callback();
	} else {
		this.programLoadedHandler = callback;
	}
};

Logic.prototype.setProgramLoaded = function(callback) {
	this.programIsLoaded = true;
	if(this.programLoadedHandler) {
		this.programLoadedHandler();
	}
};

Logic.prototype.clone = function() {
	var newLogic = new Logic(this.program);
	if(this.isRemote) {
		newLogic.isRemote = true;
		newLogic.programURI = this.programURI;
	}
	return newLogic;
};

Logic.prototype.runProcedure = function(proc) {
	var CMD = new Variable();
	var logic = this;
	try {
		this.run(["cjs#procedureCommand", proc, CMD], function(){
			CMD.getValue()(logic);
		});
	} catch(e) {
		//console.log(e);
		//console.log("Recent calls: " + this.recentCalls.join("\n"));
		var trace = this.ctx("tracing").getValue(this);
		if(typeof(trace)=="function") {
			trace(e.toString());
		}
		throw e; 
	}
};

Logic.prototype.procedure = function(proc) {
	var logic = this;
	return function() { logic.runProcedure(proc); };
};

// Go deep inside the term, replacing all bound variables with their values
Logic.prototype.concreteValue = function(term) {
	term = this.realValue(term);
	if(term instanceof Array) {
		var newTerm = [];
		for(var i = 0; i < term.length; i++) {
			newTerm.push(this.concreteValue(term[i]));
		}
		return newTerm;
	} else {
		return term; // In case of a bound variable, this is already its bound value.
	}
}

Logic.prototype.variable = function() { return new Variable(); }

// Returns a function that, when executed, executes the given function with the current variable assignments
Logic.prototype.snapshot = function(func) {
	// Create arrays containing the current variable assignments.
	var vars = [];
	var vals = [];
	for(var i = 0; i < this.stack.length; i++) {
		if(this.stack[i].variable) {
			vars.push(this.stack[i].variable);
			vals.push(this.stack[i].variable.getValue());
		}
	}
	var logic = this;
	// Return the function
	return function() {
		var stackLevel = logic.stack.length;

		// Recreate the variable assignments
		for(var i = 0; i < vars.length; i++) {
			vars[i].bind(vals[i], logic);
		}

		// Build argument list
		var result = func.apply(null, arguments);
		logic.resume(stackLevel); // Backtrack away
		return result;
	}
};

Logic.prototype.ctx = function(ctxName) {
	if(!this.contexts[ctxName]) {
		this.contexts[ctxName] = new Variable();
	}
	return this.contexts[ctxName];
};

function Variable() {
	this.value = this;
}

Variable.variables = function(n) {
	var vars = [];
	for(var i = 0; i < n; i++) {
		vars.push(new Variable());
	}
	return vars;
}

Variable.prototype.getValue = function(logic) {
	if(logic) {
		if(this.value instanceof Variable && this.value != this) {
			this.bind(this.value.getValue(logic), logic);
		}
		return this.value;
	} else {
		if(this.value instanceof Variable && this.value != this) {
			return this.value.getValue();
		}
		return this.value;
		
	}
};

Variable.prototype.bind = function(val, logic) {
	var obj = this;
	var curr = this.value;
	var undo = function () {obj.value = curr};
	undo.variable = this;
	logic.push(undo);
	this.value = val;
};

Variable.prototype.toString = function() {
	var v = this.getValue();
	if(v instanceof Variable) {
		return "<unbound>";
	} else {
		return "[" + v + "]";
	}
};

var logic = new Logic();

/// Builtin Predicates ////
logic.program.add(["builtin#true", 0], function(logic, term, next) {
	next();
});

logic.program.add(["builtin#fail", 0], function(logic, term, next) {
	// Do nothing...
});

logic.program.addBuiltin("plus", 3, function(logic, term) {
	term[3] = term[1] + term[2];
	return true;
});

logic.program.addBuiltin("minus", 3, function(logic, term) {
	term[3] = term[1] - term[2];
	return true;
});

logic.program.addBuiltin("mult", 3, function(logic, term) {
	term[3] = term[1] * term[2];
	return true;
});

logic.program.addBuiltin("div", 3, function(logic, term) {
	term[3] = term[1] / term[2];
	return true;
});

logic.program.addBuiltin("idiv", 3, function(logic, term) {
	var div = term[1] / term[2];
	term[3] = div > 0 ? Math.floor(div) : Math.ceil(div);
	return true;
});

logic.program.addBuiltin("modulus", 3, function(logic, term) {
	term[3] = term[1] % term[2];
	return true;
});

logic.program.addBuiltin("compound", 1, function(logic, term) {
	// The argument is a typedTerm (::).  We only care about its first element.
	var arg = term[1][1];
	if(arg instanceof Variable)
		arg = arg.getValue();
	return arg instanceof Array;
});

logic.program.addBuiltin("var", 1, function(logic, term) {
	// The argument is a typedTerm (::).  We only care about its first element.
	var arg = term[1][1];
	if(arg instanceof Variable)
		arg = arg.getValue();
	return arg instanceof Variable;
});

logic.program.addBuiltin("string", 1, function(logic, term) {
	// The argument is a typedTerm (::).  We only care about its first element.
	var arg = term[1][0];
	if(arg instanceof Variable)
		arg = arg.getValue();
	return typeof(arg) == "string";
});

logic.program.addBuiltin("number", 1, function(logic, term) {
	// The argument is a typedTerm (::).  We only care about its first element.
	var arg = term[1][0];
	if(arg instanceof Variable)
		arg = arg.getValue();
	return typeof(arg) == "number";
});

logic.program.addBuiltin("strcat", 3, function(logic, term) {
	// If the third argument is a variable, concatenate both first strings.
	if(term[3] instanceof Variable) {
		term[3] = term[1] + term[2];
	} else {
		var splitPos = -1;
		// If the first is a variable, split based on the length of the second one.
		if(term[1] instanceof Variable) {
			splitPos = term[3].length - term[2].length;
		} else {
			splitPos = term[1].length;
		}
		// Update both first and second argument, so if they are not substrings of the third, the unification will fail.
		term[1] = term[3].substring(0, splitPos);
		term[2] = term[3].substring(splitPos);
	}
	//DBG("'" + term[1] + "' + '" + term[2] + "' = '" + term[3] + "'");
	return true;
});

logic.program.addBuiltin("charCodes", 2, function(logic, term) {
	if(typeof(term[1]) == "string") {
		term[2] = ["[]"];
		for(var i = term[1].length - 1; i >= 0; i--) {
			term[2] = [".", term[1].charCodeAt(i), term[2]];
		}
	} else {
		term[1] = "";
		var list = term[2];
		while(list[0] == ".") {
			term[1] += String.fromCharCode(logic.realValue(list[1]));
			list = list[2];
		}
	}
	return true;
});

logic.program.add(["builtin#if", 3], function(logic, term, next) {
	var vCond = new Variable();
	var vThen = new Variable();
	var vElse = new Variable();

	if(!logic.unify(term, ["builtin#if", vCond, vThen, vElse]))
		return;
	var status = {cond: false};
	// We push the "else" first, so it is executed last.
	// The else clause will run only if the condition fails.
	logic.push(function() {
		if(!status.cond) {
			logic.call(vElse.getValue(logic), next);
		}
	});
	// The condition will run first. If it succeeds, it will set the status to true and run the "then"
	logic.call(["builtin#once", vCond.getValue(logic)], function() {
		status.cond = true;
		logic.call(vThen.getValue(logic), next);
	});
});

logic.program.add(["builtin#once", 1], function(logic, term, next) {
	var vGoal = new Variable();

	if(!logic.unify(term, ["builtin#once", vGoal]))
		return;
	var status = {next: next};
	logic.call(vGoal.getValue(logic), function() {
		status.next();
		status.next = function() {};
	});
});


logic.program.add(["=", 2], function(logic, term, next) {
	var v = new Variable();

	if(!logic.unify(term, ["=", v, v]))
		return;
	logic.push(next);
});

logic.program.add([",", 2], function(logic, term, next) {
	var g1 = new Variable();
	var g2 = new Variable();

	if(!logic.unify(term, [",", g1, g2]))
		return;
	logic.call(g1, function() {
		logic.call(g2, next);
	});
});

logic.program.addBuiltin("parseTerm", 3, function(logic, term) {
	// Check if we need to construct or decompose
	var value = new Variable();
	var type = new Variable();
	if(!logic.unify(term[1], ["::", value, type])) {
		throw Error("First argument to parseTerm must be a typed term");
	}
	value = logic.realValue(value);
	if(value instanceof Variable) {
		// We need to construct
		var newTerm = [term[2]];
		var list = term[3];
		while(list[0] == ".") {
			// List elements are typedTerms, and we only care about the values
			var argValue = new Variable();
			var argType = new Variable();
			if(!logic.unify(list[1], ["::", argValue, argType])) {
				throw Error("Third argument to parseTerm must contain a list of typed terms");
			}
			newTerm.push(argValue.getValue(logic));
			list = logic.realValue(list[2]);
		}
		logic.unify(value, newTerm);
	} else {
		// We need to decompose
		term[2] = value[0]; // the name
		term[3] = ["[]"];
		for(var i = value.length - 1; i > 0; i--) {
			term[3] = [".", ["::", value[i], new Variable()], term[3]];
		}
	}
	return true;
});

logic.program.add(["\\+", 1], function(logic, term, next) {
	var g = new Variable();

	if(!logic.unify(term, ["\\+", g]))
		return;
	logic.call(["builtin#if", g, ["builtin#fail"], ["builtin#true"]], next);
});

function termEquals(a, b) {
	if(a instanceof Variable) {
		a = a.getValue();
	}
	if(b instanceof Variable) {
		b = b.getValue();
	}
	if(a instanceof Array) {
		if(!(b instanceof Array)) {
			return false;
		}
		if(a.length != b.length) {
			return false;
		}
		for(var i = 0; i < a.length; i++) {
			if(!termEquals(a[i], b[i]))
				return false;
		}
		return true;
	} else {
		return a == b;
	}
}

logic.program.addBuiltin("equals", 2, function(logic, term) {
	var a = term[1];
	var b = term[2];
	if(a instanceof Variable) {
		a = a.getValue();
	}
	if(b instanceof Variable) {
		b = b.getValue();
	}
	return termEquals(a[1], b[1]);
});

// This is a temporary and very partial implementation...
logic.program.addBuiltin("termToString", 5, function(logic, term) {
	term[5] = logic.termToString(term[1][1]);
	return true;
});

// Debugging...
logic.program.addBuiltin("debug", 2, function(logic, term) {
	console.log("DBG: " + term[1] + ": " + logic.termToString(term[2]));
	return true;
});

logic.program.addBuiltin("greaterThen", 2, function(logic, term) {
	return term[1] > term[2];
});

logic.program.addBuiltin("copyTerm", 2, function(logic, term) {
	term[2] = logic.fromJSON(logic.toJSON(term[1]));
	return true;
});
logic.program.add(["builtin#loadedStatement", 3], function(logic, term, next) {
	// Fail for now...
});

logic.program.addBuiltin("findall", 4, function(logic, term) {
	var tmpLogic = new Logic(logic.program);
	term[4] = ["[]"];
	tmpLogic.run(term[3], function() {
		term[4] = [".", logic.concreteValue(term[1]), term[4]];
	});
	return true;
});
