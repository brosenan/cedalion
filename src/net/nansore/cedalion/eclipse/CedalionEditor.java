/*
 * Created on Jan 19, 2006
 *
 * TODO To change the template for this generated file go to
 * Window - Preferences - Java - Code Style - Code Templates
 */
package net.nansore.cedalion.eclipse;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

import net.nansore.cedalion.execution.ExecutionContext;
import net.nansore.cedalion.execution.ExecutionContextException;
import net.nansore.cedalion.execution.Notifier;
import net.nansore.cedalion.execution.TermInstantiationException;
import net.nansore.cedalion.figures.TermFigure;
import net.nansore.cedalion.figures.VisualTerm;
import net.nansore.prolog.Compound;
import net.nansore.prolog.PrologException;
import net.nansore.prolog.PrologProxy;
import net.nansore.prolog.Variable;

import org.eclipse.core.resources.IFile;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.draw2d.MouseEvent;
import org.eclipse.jface.bindings.keys.KeyStroke;
import org.eclipse.jface.fieldassist.ContentProposalAdapter;
import org.eclipse.jface.fieldassist.IContentProposal;
import org.eclipse.jface.fieldassist.IContentProposalProvider;
import org.eclipse.jface.preference.PreferenceConverter;
import org.eclipse.jface.util.IPropertyChangeListener;
import org.eclipse.jface.util.PropertyChangeEvent;
import org.eclipse.jface.viewers.ISelection;
import org.eclipse.jface.viewers.ISelectionChangedListener;
import org.eclipse.jface.viewers.ISelectionProvider;
import org.eclipse.jface.viewers.SelectionChangedEvent;
import org.eclipse.jface.viewers.StructuredSelection;
import org.eclipse.swt.SWT;
import org.eclipse.swt.events.DisposeEvent;
import org.eclipse.swt.events.DisposeListener;
import org.eclipse.swt.graphics.Color;
import org.eclipse.swt.graphics.Font;
import org.eclipse.swt.graphics.FontData;
import org.eclipse.swt.graphics.Image;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Control;
import org.eclipse.swt.widgets.Text;
import org.eclipse.ui.IEditorInput;
import org.eclipse.ui.IEditorSite;
import org.eclipse.ui.IFileEditorInput;
import org.eclipse.ui.IWorkbenchPart;
import org.eclipse.ui.PartInitException;
import org.eclipse.ui.part.EditorPart;

/**
 * This is the Cedalion editor.  It is an Eclipse editor (EditorPart) that displays the CedalionWidget, containing a CedalionCanvas, 
 * a text entry box for entering text and command buttons.  It is responsible for loading, displaying and saving Cedalion files.
 * It also keeps track over the file's modified state.
 */
public class CedalionEditor extends EditorPart implements ISelectionProvider, TermContext, DisposeListener, IViewOpener{

	private final class CedalionProposalProvider implements IContentProposalProvider {
		public IContentProposal[] getProposals(String incompleteText, int pos) {
			if(currentTermFigure == null)
				return new IContentProposal[]{};
			return currentTermFigure.getProposals(incompleteText, pos);
		}
	}

	private CedalionWidget editorWidget;
    private List<ISelectionChangedListener> listeners = new ArrayList<ISelectionChangedListener>();
    private ISelection selection;
    private IFileEditorInput input;
	private Font normalFont;
	protected Font symbolFont;
	private VisualTerm currentTermFigure;
	private VisualTerm focused = null;

    @Override
	public void doSave(IProgressMonitor monitor) {
	    try {
			ExecutionContext exe = new ExecutionContext();
			exe.runProcedure(Compound.createCompound("cpi#saveFile", getResource(), input.getFile().getLocation().toString()));
	        firePropertyChange(PROP_DIRTY);
	        // Reload the content
	        Activator.getDefault().loadResource(input.getFile());
	        refresh();
	        System.gc();
        } catch (PrologException e) {
            e.printStackTrace();
		} catch (TermInstantiationException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (ExecutionContextException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (TermVisualizationException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}
	}

    @Override
	public void doSaveAs() {
	    // TODO: Implement
	}

    @Override
	public void init(IEditorSite site, IEditorInput input) throws PartInitException {
		setSite(site);
		setInput(input);
		this.input = (IFileEditorInput)input;
		setPartName(input.getName());
		
		site.setSelectionProvider(this);
	}

    @Override
	public boolean isDirty() {
		try {
			return PrologProxy.instance().hasSolution(Compound.createCompound("cpi#isModified", getResource()));
		} catch (PrologException e) {
			e.printStackTrace();
			return false;
		}
	}

    @Override
	public boolean isSaveAsAllowed() {
		// TODO Auto-generated method stub
		return false;
	}

    @Override
	public void createPartControl(Composite parent) {
	    editorWidget = new CedalionWidget(parent, SWT.NONE, this);	
	    editorWidget.addDisposeListener(this);
		Activator.getDefault().getPreferenceStore().addPropertyChangeListener(new IPropertyChangeListener() {

			public void propertyChange(PropertyChangeEvent event) {
				if(event.getProperty().equals("normalFont")) {
					normalFont.dispose();
					normalFont = createFont("normalFont");
				} else if(event.getProperty().equals("symbolFont")) {
					symbolFont.dispose();
					symbolFont = createFont("symbolFont");
				} 
 
			}});
		normalFont = createFont("normalFont");
		symbolFont = createFont("symbolFont");

		update.registerEditor(this);
	    
	    try {
			open();
		} catch (PrologException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (TermInstantiationException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (ExecutionContextException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (TermVisualizationException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}

        new ContentProposalAdapter(getTextEditor(), new CedalionTextContentAdapter(), new CedalionProposalProvider(), KeyStroke.getInstance(SWT.CTRL, ' '), new char[] {});
		

	}

	private void open() throws PrologException, TermInstantiationException, ExecutionContextException, TermVisualizationException {
		// Open the file
		IFile res = input.getFile();
		ExecutionContext exe = new ExecutionContext();
		exe.runProcedure(Compound.createCompound("cpi#openFile", res.getLocation().toString(), getResource(), res.getParent().getFullPath().toString()));
		// Get the root type
		Variable varType = new Variable("RootType");
		Object rootType = PrologProxy.instance().getSolution(Compound.createCompound("cpi#rootType", varType)).get(varType);
		Variable varMode = new Variable("RootType");
		Object rootMode = PrologProxy.instance().getSolution(Compound.createCompound("cpi#rootMode", varMode)).get(varMode);
		// Set the root path
		Compound path = Compound.createCompound("cpi#path", getResource(), Compound.createCompound("[]"));
		Compound descriptor = Compound.createCompound("cpi#descriptor", path, new Variable(), Compound.createCompound("[]"));
		Compound tterm = Compound.createCompound("::", descriptor, rootType);
		editorWidget.setTerm(Compound.createCompound("cpi#vis", tterm, rootMode), this);
	}

	private Font createFont(final String fontType) {
		String fontDesc = Activator.getDefault().getPreferenceStore().getString(fontType);
		if(fontDesc.equals(""))
			return editorWidget.getFont();
		FontData fontData = PreferenceConverter.getFontData(Activator.getDefault().getPreferenceStore(), fontType);
		Font normalFont = new Font(editorWidget.getDisplay(), fontData);
		return normalFont;
	}

    @Override
	public void setFocus() {
		getSite().getPage().activate(this);
		Activator.getDefault().registerViewOpener(this);
		Activator.getDefault().registerCurrentContext(this);
	}

    @Override
    public void addSelectionChangedListener(ISelectionChangedListener listener) {
        listeners.add(listener);
        
    }

    @Override
    public ISelection getSelection() {
        return selection;
    }

    @Override
    public void removeSelectionChangedListener(ISelectionChangedListener listener) {
        listeners.remove(listener);
    }

    @Override
    public void setSelection(ISelection selection) {
        this.selection = selection;
        for(Iterator<ISelectionChangedListener> i = listeners.iterator(); i.hasNext(); ) {
            i.next().selectionChanged(new SelectionChangedEvent(this, selection));
        }
    }

    @Override
    public void dispose() {
        System.out.println("Disposing editor for " + input.getFile() + " resource: " + getResource());
        try {
        	editorWidget.dispose();
			close();
		} catch (PrologException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (TermInstantiationException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		} catch (ExecutionContextException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}
    }

	private void close() throws PrologException, TermInstantiationException, ExecutionContextException {
		ExecutionContext exe = new ExecutionContext();
		exe.runProcedure(Compound.createCompound("cpi#closeFile", getResource()));
	}
    @Override
    public Text getTextEditor() {
        return editorWidget.getText();
    }

    @Override
    public void bindFigure(TermFigure figure) {
        // Do nothing
    }

    @Override
    public void selectionChanged(TermFigure figure) {
        setSelection(new StructuredSelection(figure));
        if(figure instanceof VisualTerm)
        	currentTermFigure = (VisualTerm)figure;
    }

    @Override
    public void widgetDisposed(DisposeEvent e) {
        update.unregisterEditor(this);
    }

    @Override
    public synchronized void registerTermFigure(Object termID, TermFigure figure) {
    }

    @Override
    public Color getColor() {
        return new Color(editorWidget.getDisplay(), 0, 0, 0);
    }

    @Override
    public Font getFont(int fontType) {
    	if(fontType == TermContext.NORMAL_FONT)
    		return normalFont;
    	else
    		return symbolFont;
    }

    /*public void registerDispose(TermFigure disp) {
        // TODO Auto-generated method stub
        
    }*/

    @Override
    public synchronized void figureUpdated() {
        firePropertyChange(PROP_DIRTY);
    }

    @Override
    public synchronized void unregisterTermFigure(Object termID, TermFigure figure) {
    }

	/**
	 * Returns the name of the resource, as used internally by Cedalion.
	 */
    public String getResource() {
		return input.getFile().getFullPath().toString();
	}

    /**
     * Ignored
     */
    public void handleClick(MouseEvent me) {
    }

    /**
     * Returns the canvas used by this editor
     */
    public Control getCanvas() {
        return editorWidget.getCanvas();
    }

	/**
	 * Returns this object
	 */
    public IWorkbenchPart getWorkbenchPart() {
		return this;
	}

    /**
     * Ignored
     */
    public void performDefaultAction() {
    }

	/**
	 * Causes the display to refresh
	 * @throws TermVisualizationException if one or more figures are unable to display
	 * @throws TermInstantiationException if one or more terms could not be instantiated to Java objects
	 * @throws PrologException if the Cedalion program through an exception
	 */
    public void refresh() throws TermVisualizationException, TermInstantiationException, PrologException {
        editorWidget.refresh();
        Notifier.instance().printRefCount();
        System.gc();
    }

	/**
	 * Returns the name to be used as a namespace for the file in this editor
	 */
    public String getPackage() {
		return input.getFile().getParent().getFullPath().toString();
	}

	@Override
	/**
	 * Opens a CedalionView
	 */
	public CedalionView openView() throws PartInitException {
		return (CedalionView)getSite().getPage().showView("net.nansore.cedalion.CedalionView");
	}

	@Override
	/**
	 * Uses the plug-in to load an image
	 */
	public Image getImage(String imageName) throws IOException {
		return Activator.getDefault().getImage(imageName, getEditorSite().getShell().getDisplay());
	}

	@Override
	/**
	 * XXX
	 */
	public Compound getPath() {
		return null;
	}

	@Override
	public VisualTerm getFocused() {
		return focused ;
	}

	@Override
	public void setFocused(VisualTerm visualTerm) {
		focused = visualTerm;
	}
	
	/**
	 * @return The last code element that took focus in this editor
	 */
	public VisualTerm getLastFocused() {
		return currentTermFigure;
	}

}
