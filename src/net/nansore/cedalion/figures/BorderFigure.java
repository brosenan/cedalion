/*
 * Created on Jul 24, 2006
 */
package net.nansore.cedalion.figures;

import net.nansore.cedalion.eclipse.TermContext;
import net.nansore.cedalion.eclipse.TermVisualizationException;
import net.nansore.cedalion.execution.TermInstantiationException;
import net.nansore.cedalion.execution.TermInstantiator;
import net.nansore.prolog.Compound;
import net.nansore.prolog.PrologException;

import org.eclipse.draw2d.Border;

/**
 * This is a base class for all border figures.  It assumes that the first argument of the underlying term is the content to be placed inside the border.
 */
public abstract class BorderFigure extends TermContextProxy {

    private TermFigure figure;

	public BorderFigure(Compound term, TermContext parent) throws TermVisualizationException, TermInstantiationException, PrologException {
        super(parent);
        try {
            figure = (TermFigure) TermInstantiator.instance().instantiate(
                    (Compound) term.arg(1), parent);
			add(figure);
            setBorder(createBorder(term, parent));
        } catch (ClassCastException e) {
            throw new TermVisualizationException(e);
        }        
    }

    /**
     * Override this method to create the border suitable for each child implementation
     * @param term the prolog term corresponding to the term object
     * @return the newly created draw2d border object
     * @throws TermVisualizationException 
     */
    protected abstract Border createBorder(Compound term, TermContext context) throws TermVisualizationException;

    public void dispose() {
    	figure.dispose();
    }

}
