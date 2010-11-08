package net.nansore.cedalion.cmd;

import java.io.FileWriter;
import java.io.IOException;
import java.util.Iterator;
import java.util.Map;

import net.nansore.cedalion.execution.ExecutionContext;
import net.nansore.cedalion.execution.ExecutionContextException;
import net.nansore.cedalion.execution.ICommand;
import net.nansore.cedalion.execution.TermInstantiationException;
import net.nansore.prolog.Compound;
import net.nansore.prolog.PrologException;
import net.nansore.prolog.Variable;

/**
 * This is a command for generating files.  It takes 3 arguments: (1) the file name, (2) a variable that will be bound to text to be written, 
 * and (3) a goal that succeeds for every value to be written.
 * When executed the command generates the given file, writing the string bound to the variable for each result of the goal.  
 */
public class GenerateFile implements ICommand {
	
	private String fileName;
	private Variable strVar;
	private Compound goal;

	public GenerateFile(Compound term) {
		fileName = (String)term.arg(1);
		strVar = (Variable)term.arg(2);
		goal = (Compound)term.arg(3);
	}

	@Override
	public void run(ExecutionContext executionContext) throws PrologException,
			TermInstantiationException, ExecutionContextException {
		try {
			FileWriter writer = new FileWriter(fileName);
			for(Iterator<Map<Variable, Object>> solutions = executionContext.prolog().getSolutions(goal); solutions.hasNext(); ) {
				Map<Variable, Object> solution = solutions.next();
				String str = (String)solution.get(strVar);
				writer.write(str + '\n');
			}
			writer.close();
		} catch (IOException e) {
			throw new ExecutionContextException(e.getMessage());
		}
	}

}