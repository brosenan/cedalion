/*
 * Created on Sep 18, 2006
 */
package net.nansore.visualterm.figures;

import net.nansore.cedalion.eclipse.TermContext;
import net.nansore.cedalion.eclipse.TermVisualizationException;
import net.nansore.cedalion.execution.TermInstantiationException;
import net.nansore.cedalion.execution.TermInstantiator;
import net.nansore.prolog.Compound;
import net.nansore.prolog.PrologException;

import org.eclipse.draw2d.AbstractBorder;
import org.eclipse.draw2d.FlowLayout;
import org.eclipse.draw2d.Graphics;
import org.eclipse.draw2d.IFigure;
import org.eclipse.draw2d.geometry.Insets;
import org.eclipse.draw2d.geometry.Rectangle;
import org.eclipse.swt.graphics.Color;

public class underline extends TermContextProxy {

    public class UndrelineBorder extends AbstractBorder {

        private Color color;

        public UndrelineBorder(Color color) {
            this.color = color;
        }

        public Insets getInsets(IFigure arg0) {
            return new Insets(0, 0, 1, 0);
        }

        public void paint(IFigure fig, Graphics g, Insets insets) {
            g.setForegroundColor(color);
            Rectangle b = fig.getBounds().getCropped(insets);
            g.drawLine(b.x, b.y + b.height - 1, b.x + b.width, b.y + b.height - 1);
        }

    }

    public underline(Compound term, TermContext parent) throws TermVisualizationException, TermInstantiationException, PrologException {
        super(parent);
        setLayoutManager(new FlowLayout());
        add((IFigure) TermInstantiator.instance().instantiate((Compound)term.arg(1), this));
        setBorder(new UndrelineBorder(getColor()));
    }

    public void dispose() {
    }

}