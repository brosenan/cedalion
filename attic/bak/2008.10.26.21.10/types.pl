%:- [util].

% Operator :: - is of type..
:- op(200, xfx, '::').
% Operator ::< - is a special case of...
:- op(700, xfx, '::<').

% Transform a term containing type defintions to a plain term.
removeTypeDefinitions(TermWithTypeDefs, PlainTerm) :-
	transformTerm({(A::_->A)}, TermWithTypeDefs, PlainTerm).

% checkType(Term, Type, Errors): 
%	Check that term Term is of type Type.  Errors will list the non-conformances
checkType(Term, Type, Output):-
	checkType(Term, Type, root, ([]->Output)),
	assertDefinitions(Output).
% checkType(Term, Type, (VarsIn->VarsOut), Path, (ErrIn->ErrOut)): 
%	Check that Term corresponds to type Type.  VarsIn and VarsOut are variable bindings,
%	Path is a list of numbers providing the path to the current sub term, 
%	and ErrIn and ErrOut are the list of errors encountered.
%	This predicate always succeeds.  If the term is indeed of the given type, ErrOut==ErrIn.
checkType(Var, Type, Path, (Input->[marker(Path, foundType(Type))|Output])) :-
	var(Var),
	checkVarType(Var, Type, (Input->Output)).
checkType(Term, member(Set), Path, (Input->[marker(Path, foundType(Type))|Output])) :-
	\+var(Set),
	!,
	checkType(Set, set(ItemType), Path/set, (Input->SetOutput)),
	checkType(Term, ItemType, Path, (SetOutput->MidOutput)),
	checkMember(Term, Set, Path, (MidOutput->Output)).
checkType(Term, Type, Path, (Input->[marker(Path, foundType(Type))|Output])) :-
	classify(Term, ClassifiedType, Path, (Input->MidOutput)) ->
		failsafeReconcileTypes(Type, ClassifiedType, Path, (MidOutput->Output));
		createDefinition(Term, Type, Path, (Input->Output)).

% Check that a list of terms is of a list of types
checkTypes([], [], _, _, (Input->Input)).
checkTypes([FirstTerm | RestTerms], [FirstType | RestTypes], Path, First, (Input->Output)) :-
	checkType(FirstTerm, FirstType, Path/First, (Input->MidOutput)),
	Next is First + 1,
	checkTypes(RestTerms, RestTypes, Path, Next, (MidOutput->Output)).

% checkVarType(Var, Type, VarTypes):
%	Check that Var is associated with type Type in VarTypes.  If not listed, a binding is added.
checkVarType(Var, Type, (Input->Input)) :-
	findVarType(Var, Input, VarType),
	!,
	reconcileTypes(Type, VarType).
checkVarType(Var, Type, (Input->[Var=Type|Input])).

findVarType(Var, [FirstVar=Type | _], Type) :-
	Var==FirstVar.
findVarType(Var, [_ | Rest], Type) :-
	findVarType(Var, Rest, Type).
	

% classify(Term, Type, VarTypes, Path, Errors) :
% 	Classify Term - try to provide a type for it (Type).  Errors in child terms are reported in Errors.
%	This predicate fails if the term itself (not child-terms) cannot be classified.
classify(Num, number, _, (Input->Input)) :-
	number(Num),
	!.
classify(Var, Type, _, (Input->Input)) :-
	var(Var),
	!,
	findVarType(Var, Input, Type).
classify(Term::Type, Type, Path, (Input->Output)) :-
	!,
	checkType(Type, type, Path/2, (Input->MidOutput)),
	checkType(Term, Type, Path/1, (MidOutput->Output)).

classify(Term, Type, Path, (Input->Output)) :-
	Term =.. [Func | Args],
	sameSizeList(Args, ArgTypes),
	defined(Input, Func, ArgTypes, Type),
	checkTypes(Args, ArgTypes, Path, 1, (Input->Output)).

% classifyList(Terms, Types, VarTypes, Path, First, (ErrIn->ErrOut)):
%	Classify a list of terms.
classifyList([], [], _, _, (Errors->Errors)).
classifyList([FirstTerm | RestTerms], [FirstType | RestTypes], Path, First, (Input->Output)) :-
	classify(FirstTerm, FirstType, Path/First, (Input->MidOutput)),
	Next is First + 1,
	classifyList(RestTerms, RestTypes, Path, Next, (MidOutput->Output)).

% reconcileTypes(Type, GivenType)
%	Reconciles between the given type GivenType and the expected type Type.
reconcileTypes(Type, Type) :-
	!.
reconcileTypes(Type, GivenType) :-
	GivenType ::< MoreGeneralType,
	reconcileTypes(Type, MoreGeneralType).

% failsafeReconcileTypes(Type, ClassifiedType, Path, (ErrIn->ErrOut)):
%	Perform a failsafe reconciliation - if fails, an error is recorded in ErrOut.
failsafeReconcileTypes(Type, ClassifiedType, _, (Input->Input)) :-
	reconcileTypes(Type, ClassifiedType).
failsafeReconcileTypes(Type, ClassifiedType, Path, (Input->[marker(Path, error(typeMismatch(Type, ClassifiedType)))|Input])) :-
	\+ reconcileTypes(Type, ClassifiedType).

% createDefinition(Term, Type, Path, (Input->Output)):
%	Create a difinition for the top level element in Term, to be of type Type, assuming all arguments are classifiable
createDefinition(Var, _, Path, (Input->[marker(Path, error(untypedVariable))|Input])) :-
	var(Var),
	!.
%createDefinition(_, Type, (VarsIn->VarsIn), Path, (ErrIn->[marker(Path, error(looseType))|ErrIn])) :-
%createDefinition(_, Type, (VarsIn->VarsIn), Path, (ErrIn->ErrIn)) :-
%	var(Type),
%	!.
createDefinition(Term, Type, Path, (Input->[marker(Path, defined(Func, ArgTypes, Type))|Output])) :-
	Term =.. [Func | Args],
	classifyList(Args, ArgTypes, Path, 1, (Input->Output)),
	!.
createDefinition(Term, Type, Path, (Input->[marker(Path/Index, error(unclassified))|Output])) :-
	Term =.. [Func | Args],
	unclassifiedIndex(Args, (Input->Output), 1, Index).

unclassifiedIndex([FirstTerm | RestTerms], (Input->Output), First, Index) :-
	Next is First + 1,
	?classify(FirstTerm, _, unclassified, (Input -> MidOutput)),
	!,
	unclassifiedIndex(RestTerms, (MidOutput->Output), Next, Index).
unclassifiedIndex(_, (Input->Input), Index, Index).

% isOfType(Term, Type) :
%	Succeeds if Term is of Type
isOfType(Term, Type) :-
	classify(Term, ClassifiedType, [], ([]->Output)),
	\+member(marker(_, error(_)), Output),
	reconcileTypes(Type, ClassifiedType).

% Union type
definition(+, [T, T], T, []).
definition(::<, [type, type], goal, []).
A+_ ::< A.
_+B ::< B.

definition(member, [set(_)], type, []).

% checkMember(Item, Set, Path, (ErrIn->ErrOut)):
%	Failsafe membership test - If Item is not a member of Set, an error is added to ErrOut
checkMember(Item, Set, _, (ErrIn->ErrIn)) :-
	member(Item, Set),
	!.
checkMember(_, Set, Path, (ErrIn->[marker(Path, error(notMemberOf(Set))) | ErrIn])).

% Look for definitions
defined(_, Func, ArgTypes, Type) :-
	definition(Func, ArgTypes, Type, _).
defined(Inputs, Func, ArgTypes, Type) :-
	member(marker(_, defined(Func, ArgTypes, Type)), Inputs).

% Assert all definitions in the output to the database
assertDefinitions(Inputs) :-
	forall(member(defined(Func, ArgTypes, Type, Path), Inputs), assert(definition(Func, ArgTypes, Type, Path))).

% isPathPrefix(Path, Prefix):
%	Is Prefix a prefix of path Path?
isPathPrefix(Path, Path).
isPathPrefix(Path/_, Prefix) :-
	isPathPrefix(Path, Prefix).

